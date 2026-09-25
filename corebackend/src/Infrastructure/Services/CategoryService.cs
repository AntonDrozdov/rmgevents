using System.Text.RegularExpressions;
using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed partial class CategoryService(
    ICategoryRepository categoryRepository,
    IPermissionService permissionService,
    IEventStateGuard eventStateGuard,
    IEventLogService eventLogService) : ICategoryService
{
    public async Task<List<Application.Entities.Category>> GetCategoriesByEventAsync(long eventId, long loginId)
    {
        var userGroupId = await permissionService.GetUserGroupInEventAsync(loginId, eventId);
        if (!userGroupId.HasValue)
            throw new UnauthorizedAccessException("User is not assigned to this event");

        return await categoryRepository.GetByEventIdAsync(eventId);
    }

    public async Task<Application.Entities.Category> CreateCategoryAsync(
        long eventId,
        long loginId,
        string name,
        string color)
    {
        await EnsureCanManageCategoriesAsync(eventId, loginId);

        var normalizedName = NormalizeName(name);
        var normalizedColor = NormalizeColor(color);
        if (await categoryRepository.ExistsByNameAsync(eventId, normalizedName))
            throw new InvalidOperationException("Category with the same name already exists");

        var category = new Application.Entities.Category
        {
            EventId = eventId,
            Name = normalizedName,
            Color = normalizedColor,
            CreatedAt = DateTimeOffset.UtcNow
        };

        await categoryRepository.AddAsync(category);
        await categoryRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            eventId,
            loginId,
            "created",
            "Category",
            category.Id,
            "Создана категория",
            $"Категория: {category.Name}");

        return category;
    }

    public async Task<Application.Entities.Category> UpdateCategoryAsync(
        long eventId,
        long categoryId,
        long loginId,
        string name,
        string color)
    {
        await EnsureCanManageCategoriesAsync(eventId, loginId);

        var category = await categoryRepository.GetByIdAsync(categoryId);
        if (category == null || category.EventId != eventId)
            throw new InvalidOperationException($"Category {categoryId} not found");

        var normalizedName = NormalizeName(name);
        var normalizedColor = NormalizeColor(color);
        if (await categoryRepository.ExistsByNameAsync(eventId, normalizedName, categoryId))
            throw new InvalidOperationException("Category with the same name already exists");

        category.Name = normalizedName;
        category.Color = normalizedColor;

        await categoryRepository.UpdateAsync(category);
        await categoryRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            eventId,
            loginId,
            "updated",
            "Category",
            category.Id,
            "Изменена категория",
            $"Категория: {category.Name}");

        return category;
    }

    public async Task DeleteCategoryAsync(long eventId, long categoryId, long loginId)
    {
        await EnsureCanManageCategoriesAsync(eventId, loginId);

        var category = await categoryRepository.GetByIdAsync(categoryId);
        if (category == null || category.EventId != eventId)
            throw new InvalidOperationException($"Category {categoryId} not found");

        var categoryName = category.Name;

        await categoryRepository.DeleteAsync(categoryId);
        await categoryRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            eventId,
            loginId,
            "deleted",
            "Category",
            categoryId,
            "Удалена категория",
            $"Категория: {categoryName}");
    }

    private async Task EnsureCanManageCategoriesAsync(long eventId, long loginId)
    {
        await eventStateGuard.EnsureActiveAsync(eventId);

        if (!await permissionService.HasPermissionAsync(loginId, eventId, "create_event"))
            throw new UnauthorizedAccessException("No permission to manage categories");
    }

    private static string NormalizeName(string name)
    {
        var normalized = name.Trim();
        if (normalized.Length == 0)
            throw new InvalidOperationException("Category name is required");
        if (normalized.Length > 50)
            throw new InvalidOperationException("Category name is too long");

        return normalized;
    }

    private static string NormalizeColor(string color)
    {
        var normalized = color.Trim();
        if (!HexColorRegex().IsMatch(normalized))
            throw new InvalidOperationException("Category color must be a hex color");

        return normalized.ToUpperInvariant();
    }

    [GeneratedRegex("^#[0-9A-Fa-f]{6}$")]
    private static partial Regex HexColorRegex();
}
