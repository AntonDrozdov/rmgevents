using Application.Services;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Services;

public sealed class GroupTemplateService(
    ApplicationDbContext db,
    IPermissionService permissionService,
    IEventStateGuard eventStateGuard,
    IEventLogService eventLogService) : IGroupTemplateService
{
    private const int MaxNameLength = 255;
    private const int MaxDescriptionLength = 2000;

    public async Task<List<GroupTemplateSummary>> GetTemplatesAsync(
        long eventId,
        long loginId,
        CancellationToken cancellationToken = default)
    {
        await EnsureCanManageTemplatesAsync(eventId, loginId);

        return await db.GroupTemplates
            .AsNoTracking()
            .Include(template => template.CreatedByLogin)
            .Include(template => template.Items)
            .OrderByDescending(template => template.CreatedAt)
            .Select(template => new GroupTemplateSummary(
                template.Id,
                template.Name,
                template.Description,
                template.Items.Count,
                template.CreatedByLogin == null ? "Система" : template.CreatedByLogin.LoginValue,
                template.CreatedAt))
            .ToListAsync(cancellationToken);
    }

    public async Task<GroupTemplateSummary> SaveFromEventAsync(
        long eventId,
        long loginId,
        string name,
        string? description,
        CancellationToken cancellationToken = default)
    {
        var strategy = db.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(() => SaveFromEventCoreAsync(
            eventId,
            loginId,
            name,
            description,
            cancellationToken));
    }

    private async Task<GroupTemplateSummary> SaveFromEventCoreAsync(
        long eventId,
        long loginId,
        string name,
        string? description,
        CancellationToken cancellationToken)
    {
        await eventStateGuard.EnsureActiveAsync(eventId);
        await EnsureCanManageTemplatesAsync(eventId, loginId);

        var normalizedName = NormalizeName(name);
        var normalizedDescription = NormalizeDescription(description);
        var groups = await db.Groups
            .Where(group => group.EventId == eventId)
            .AsNoTracking()
            .ToListAsync(cancellationToken);
        var rootGroups = groups.Where(group => group.ParentGroupId == null).ToList();
        if (rootGroups.Count != 1)
            throw new InvalidOperationException("У мероприятия должна быть одна корневая группа для сохранения шаблона.");

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var template = new Application.Entities.GroupTemplate
        {
            Name = normalizedName,
            Description = normalizedDescription,
            CreatedByLoginId = loginId,
            CreatedAt = DateTimeOffset.UtcNow
        };
        await db.GroupTemplates.AddAsync(template, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        var childrenByParentId = groups
            .Where(group => group.ParentGroupId.HasValue)
            .GroupBy(group => group.ParentGroupId!.Value)
            .ToDictionary(group => group.Key, group => group.OrderBy(item => item.Name).ThenBy(item => item.Id).ToList());

        var itemsCreated = await CopyGroupToTemplateAsync(
            template.Id,
            rootGroups[0],
            null,
            0,
            childrenByParentId,
            cancellationToken);

        await db.SaveChangesAsync(cancellationToken);

        await eventLogService.AddAsync(
            eventId,
            loginId,
            "group_template_created",
            "GroupTemplate",
            template.Id,
            "Сохранен шаблон групп",
            $"Шаблон: {template.Name}, групп в шаблоне: {itemsCreated}");

        await transaction.CommitAsync(cancellationToken);

        var createdByLogin = await db.Logins
            .AsNoTracking()
            .Where(login => login.Id == loginId)
            .Select(login => login.LoginValue)
            .FirstOrDefaultAsync(cancellationToken) ?? "Система";

        return new GroupTemplateSummary(
            template.Id,
            template.Name,
            template.Description,
            itemsCreated,
            createdByLogin,
            template.CreatedAt);
    }

    public async Task<GroupTemplateApplyResult> ApplyToEventAsync(
        long eventId,
        long loginId,
        long templateId,
        CancellationToken cancellationToken = default)
    {
        var strategy = db.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(() => ApplyToEventCoreAsync(
            eventId,
            loginId,
            templateId,
            cancellationToken));
    }

    private async Task<GroupTemplateApplyResult> ApplyToEventCoreAsync(
        long eventId,
        long loginId,
        long templateId,
        CancellationToken cancellationToken)
    {
        await eventStateGuard.EnsureActiveAsync(eventId);
        await EnsureCanManageTemplatesAsync(eventId, loginId);

        var template = await db.GroupTemplates
            .Include(item => item.Items)
            .FirstOrDefaultAsync(item => item.Id == templateId, cancellationToken);
        if (template == null)
            throw new InvalidOperationException("Шаблон групп не найден.");

        var groups = await db.Groups
            .Where(group => group.EventId == eventId)
            .ToListAsync(cancellationToken);
        var rootGroups = groups.Where(group => group.ParentGroupId == null).ToList();
        if (rootGroups.Count != 1)
            throw new InvalidOperationException("У мероприятия должна быть одна корневая группа.");

        var usersCount = await db.Users.CountAsync(user => user.EventId == eventId, cancellationToken);
        var guestsCount = await db.Guests.CountAsync(guest => guest.EventId == eventId, cancellationToken);
        var hasPeople = usersCount > 0 || guestsCount > 0;
        var hasOnlyRoot = groups.Count == 1;
        if (hasPeople && !hasOnlyRoot)
        {
            throw new InvalidOperationException(
                "Нельзя применить шаблон: в мероприятии есть сотрудники или гости, а структура групп уже содержит дочерние группы. Сначала сбросьте группы до одной корневой.");
        }

        var templateRootItems = template.Items.Where(item => item.ParentItemId == null).ToList();
        if (templateRootItems.Count != 1)
            throw new InvalidOperationException("Шаблон должен содержать одну корневую группу.");

        var rootGroup = rootGroups[0];
        var itemsToCreate = template.Items.Where(item => item.Id != templateRootItems[0].Id).ToList();
        var duplicateTemplateName = itemsToCreate
            .GroupBy(item => item.Name)
            .FirstOrDefault(group => group.Count() > 1)
            ?.Key;
        if (!string.IsNullOrWhiteSpace(duplicateTemplateName))
            throw new InvalidOperationException($"Шаблон содержит несколько групп с названием «{duplicateTemplateName}». Такие группы нельзя применить в текущей модели данных.");

        if (itemsToCreate.Any(item => item.Name == rootGroup.Name))
            throw new InvalidOperationException($"Шаблон содержит группу «{rootGroup.Name}», а такое название уже использует корневая группа мероприятия.");

        var groupsToDelete = groups
            .Where(group => group.Id != rootGroup.Id)
            .OrderByDescending(group => GetDepth(group, groups))
            .ToList();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        foreach (var group in groupsToDelete)
            db.Groups.Remove(group);

        if (groupsToDelete.Count > 0)
            await db.SaveChangesAsync(cancellationToken);

        var itemsByParentId = template.Items
            .Where(item => item.ParentItemId.HasValue)
            .GroupBy(item => item.ParentItemId!.Value)
            .ToDictionary(group => group.Key, group => group.OrderBy(item => item.SortOrder).ThenBy(item => item.Name).ToList());

        var groupsCreated = 0;
        foreach (var childItem in itemsByParentId.GetValueOrDefault(templateRootItems[0].Id) ?? [])
            groupsCreated += await CopyTemplateItemToGroupAsync(eventId, rootGroup.Id, childItem, itemsByParentId, cancellationToken);

        await db.SaveChangesAsync(cancellationToken);

        var warnings = new List<string>
        {
            "Корневая группа мероприятия сохранена. Дочерние группы шаблона добавлены внутрь существующего корня."
        };

        await eventLogService.AddAsync(
            eventId,
            loginId,
            "group_template_applied",
            "GroupTemplate",
            template.Id,
            "Применен шаблон групп",
            $"Шаблон: {template.Name}, удалено групп: {groupsToDelete.Count}, создано групп: {groupsCreated}, корневая группа сохранена: {rootGroup.Name}");

        await transaction.CommitAsync(cancellationToken);

        return new GroupTemplateApplyResult(
            template.Id,
            template.Name,
            groupsToDelete.Count,
            groupsCreated,
            rootGroup.Id,
            rootGroup.Quota,
            warnings);
    }

    private async Task EnsureCanManageTemplatesAsync(long eventId, long loginId)
    {
        if (!await permissionService.HasPermissionAsync(loginId, eventId, "create_event"))
            throw new UnauthorizedAccessException("No permission to manage group templates");
    }

    private async Task<int> CopyGroupToTemplateAsync(
        long templateId,
        Application.Entities.Group group,
        long? parentItemId,
        int sortOrder,
        IReadOnlyDictionary<long, List<Application.Entities.Group>> childrenByParentId,
        CancellationToken cancellationToken)
    {
        var item = new Application.Entities.GroupTemplateItem
        {
            TemplateId = templateId,
            ParentItemId = parentItemId,
            Name = group.Name,
            Quota = group.Quota,
            SortOrder = sortOrder
        };

        await db.GroupTemplateItems.AddAsync(item, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        var total = 1;
        var children = childrenByParentId.GetValueOrDefault(group.Id) ?? [];
        for (var index = 0; index < children.Count; index++)
            total += await CopyGroupToTemplateAsync(templateId, children[index], item.Id, index, childrenByParentId, cancellationToken);

        return total;
    }

    private async Task<int> CopyTemplateItemToGroupAsync(
        long eventId,
        long parentGroupId,
        Application.Entities.GroupTemplateItem item,
        IReadOnlyDictionary<long, List<Application.Entities.GroupTemplateItem>> itemsByParentId,
        CancellationToken cancellationToken)
    {
        var group = new Application.Entities.Group
        {
            EventId = eventId,
            ParentGroupId = parentGroupId,
            Name = item.Name,
            Quota = item.Quota,
            CreatedAt = DateTimeOffset.UtcNow
        };

        await db.Groups.AddAsync(group, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        var total = 1;
        var children = itemsByParentId.GetValueOrDefault(item.Id) ?? [];
        foreach (var child in children)
            total += await CopyTemplateItemToGroupAsync(eventId, group.Id, child, itemsByParentId, cancellationToken);

        return total;
    }

    private static int GetDepth(Application.Entities.Group group, List<Application.Entities.Group> groups)
    {
        var depth = 0;
        var parentId = group.ParentGroupId;
        while (parentId.HasValue)
        {
            var parent = groups.FirstOrDefault(item => item.Id == parentId.Value);
            if (parent == null)
                break;

            depth++;
            parentId = parent.ParentGroupId;
        }

        return depth;
    }

    private static string NormalizeName(string name)
    {
        var normalized = name.Trim();
        if (normalized.Length == 0)
            throw new InvalidOperationException("Название шаблона обязательно.");
        if (normalized.Length > MaxNameLength)
            throw new InvalidOperationException("Название шаблона слишком длинное.");

        return normalized;
    }

    private static string? NormalizeDescription(string? description)
    {
        var normalized = description?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return null;
        if (normalized.Length > MaxDescriptionLength)
            throw new InvalidOperationException("Описание шаблона слишком длинное.");

        return normalized;
    }
}
