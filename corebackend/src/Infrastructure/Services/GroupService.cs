using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed class GroupService(
    IGroupRepository groupRepository,
    IUserRepository userRepository,
    IGuestRepository guestRepository,
    IPermissionService permissionService,
    IEventStateGuard eventStateGuard,
    IEventLogService eventLogService) : IGroupService
{
    private const int DefaultRootQuota = 10000;

    public async Task<Application.Entities.Group> CreateGroupAsync(
        long eventId,
        long userId,
        string name,
        int quota,
        long? parentGroupId)
    {
        await eventStateGuard.EnsureActiveAsync(eventId);

        // Проверяем разрешение
        if (!await permissionService.HasPermissionAsync(userId, eventId, "create_group"))
            throw new UnauthorizedAccessException("No permission to create groups");
        
        // Получаем группу пользователя
        var userGroupId = await permissionService.GetUserGroupInEventAsync(userId, eventId);
        if (!userGroupId.HasValue)
            throw new InvalidOperationException("User not assigned to a group");
        
        // Проверяем что пользователь может создавать в этой родительской группе
        long actualParentId = parentGroupId ?? userGroupId.Value;
        
        if (!await permissionService.CanCreateGroupInParentAsync(userId, eventId, actualParentId, userGroupId.Value))
            throw new UnauthorizedAccessException("Cannot create group in this parent group");
        
        // Валидируем квоты
        await ValidateNewChildQuotaAsync(actualParentId, quota);
        
        var group = new Application.Entities.Group
        {
            Id = 0,
            EventId = eventId,
            ParentGroupId = actualParentId,
            Name = name,
            Quota = quota,
            CreatedAt = DateTimeOffset.UtcNow
        };
        
        await groupRepository.AddAsync(group);
        await groupRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            eventId,
            userId,
            "created",
            "Group",
            group.Id,
            "Создана группа",
            $"Группа: {group.Name}, квота: {group.Quota}");
        
        return group;
    }
    
    public async Task<Application.Entities.Group?> GetGroupAsync(long groupId)
    {
        return await groupRepository.GetByIdAsync(groupId);
    }
    
    public async Task<List<Application.Entities.Group>> GetGroupsByEventAsync(long eventId)
    {
        return await groupRepository.GetByEventIdAsync(eventId);
    }
    
    public async Task<List<Application.Entities.Group>> GetGroupHierarchyAsync(long eventId)
    {
        var groups = await groupRepository.GetByEventIdAsync(eventId);
        return groups.Where(group => group.ParentGroupId == null).ToList();
    }
    
    public async Task<int> GetAvailableQuotaAsync(long groupId)
    {
        var group = await groupRepository.GetByIdAsync(groupId);
        if (group == null)
            return 0;
        
        // available = quota - sum(children_quotas)
        var children = await groupRepository.GetChildrenAsync(groupId);
        var childrenQuotaSum = children.Sum(g => g.Quota);
        
        return group.Quota - childrenQuotaSum;
    }
    
    public async Task ValidateQuotaHierarchyAsync(long groupId, int newQuota)
    {
        if (newQuota < 0)
            throw new InvalidOperationException("Group quota cannot be negative");

        var group = await groupRepository.GetByIdAsync(groupId);
        if (group == null)
            throw new InvalidOperationException($"Group {groupId} not found");
        
        var children = await groupRepository.GetChildrenAsync(groupId);
        var childrenQuotaSum = children.Sum(g => (long)g.Quota);
        
        if (childrenQuotaSum > newQuota)
            throw new InvalidOperationException(
                $"New quota {newQuota} is less than sum of children quotas {childrenQuotaSum}");
        
        // Recursively check parent
        if (group.ParentGroupId.HasValue)
        {
            var parent = await groupRepository.GetByIdAsync(group.ParentGroupId.Value);
            if (parent != null)
            {
                var siblings = await groupRepository.GetChildrenAsync(parent.Id);
                var siblingsQuotaSum = siblings.Where(s => s.Id != groupId).Sum(s => (long)s.Quota);
                var newParentUsed = siblingsQuotaSum + newQuota;
                
                if (newParentUsed > parent.Quota)
                    throw new InvalidOperationException(
                        $"Children quotas sum would exceed parent quota");
            }
        }
    }

    private async Task ValidateNewChildQuotaAsync(long parentGroupId, int childQuota)
    {
        if (childQuota < 0)
            throw new InvalidOperationException("Group quota cannot be negative");

        var parent = await groupRepository.GetByIdAsync(parentGroupId);
        if (parent == null)
            throw new InvalidOperationException($"Parent group {parentGroupId} not found");

        var children = await groupRepository.GetChildrenAsync(parentGroupId);
        var allocatedQuota = children.Sum(group => (long)group.Quota);
        var quotaAfterCreation = allocatedQuota + childQuota;

        if (quotaAfterCreation > parent.Quota)
        {
            var availableQuota = Math.Max(0L, parent.Quota - allocatedQuota);
            throw new InvalidOperationException(
                $"Child groups quotas sum would exceed parent quota. Available quota: {availableQuota}");
        }
    }

    private async Task ValidateGroupChildrenQuotaAsync(long groupId, int newQuota)
    {
        if (newQuota < 0)
            throw new InvalidOperationException("Group quota cannot be negative");

        var children = await groupRepository.GetChildrenAsync(groupId);
        var childrenQuotaSum = children.Sum(group => (long)group.Quota);

        if (childrenQuotaSum > newQuota)
            throw new InvalidOperationException(
                $"New quota {newQuota} is less than sum of children quotas {childrenQuotaSum}");
    }

    private async Task ValidateNewParentQuotaAsync(long parentGroupId, long movingGroupId, int movingGroupQuota)
    {
        if (movingGroupQuota < 0)
            throw new InvalidOperationException("Group quota cannot be negative");

        var parent = await groupRepository.GetByIdAsync(parentGroupId);
        if (parent == null)
            throw new InvalidOperationException($"Parent group {parentGroupId} not found");

        var children = await groupRepository.GetChildrenAsync(parentGroupId);
        var allocatedQuota = children
            .Where(group => group.Id != movingGroupId)
            .Sum(group => (long)group.Quota);
        var quotaAfterMove = allocatedQuota + movingGroupQuota;

        if (quotaAfterMove > parent.Quota)
        {
            var availableQuota = Math.Max(0L, parent.Quota - allocatedQuota);
            throw new InvalidOperationException(
                $"Child groups quotas sum would exceed parent quota. Available quota: {availableQuota}");
        }
    }
    
    public async Task UpdateGroupAsync(
        long eventId,
        long userId,
        long groupId,
        string name,
        int quota,
        long? parentGroupId = null,
        bool moveToParent = false)
    {
        var group = await groupRepository.GetByIdAsync(groupId);
        if (group == null || group.EventId != eventId)
            throw new InvalidOperationException($"Group {groupId} not found");

        await eventStateGuard.EnsureActiveAsync(eventId);

        await EnsureCanManageGroupAsync(eventId, userId, groupId);

        var oldParentGroupId = group.ParentGroupId;
        var oldQuota = group.Quota;
        var moved = moveToParent && parentGroupId.HasValue && parentGroupId.Value != oldParentGroupId;
        var descendants = new List<Application.Entities.Group>();

        if (moveToParent)
        {
            if (!group.ParentGroupId.HasValue)
                throw new InvalidOperationException("The root group cannot be moved");

            if (!parentGroupId.HasValue)
                throw new InvalidOperationException("Target parent group is required");

            var newParent = await groupRepository.GetByIdAsync(parentGroupId.Value);
            if (newParent == null || newParent.EventId != eventId)
                throw new InvalidOperationException($"Parent group {parentGroupId.Value} not found");

            await EnsureCanManageGroupAsync(eventId, userId, parentGroupId.Value);

            if (newParent.Id == group.Id)
                throw new InvalidOperationException("Group cannot be moved into itself");

            descendants = await groupRepository.GetAllDescendantsAsync(group.Id);
            if (descendants.Any(descendant => descendant.Id == newParent.Id))
                throw new InvalidOperationException("Group cannot be moved into its child branch");
        }

        if (moved)
        {
            quota = 0;
        }
        else
        {
            await ValidateQuotaHierarchyAsync(groupId, quota);
        }

        group.Name = name;
        group.Quota = quota;
        if (moved)
        {
            group.ParentGroupId = parentGroupId;
            foreach (var descendant in descendants)
            {
                descendant.Quota = 0;
                await groupRepository.UpdateAsync(descendant);
            }
        }
        
        await groupRepository.UpdateAsync(group);
        await groupRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            eventId,
            userId,
            "updated",
            "Group",
            group.Id,
            "Изменена группа",
            moved
                ? $"Группа: {group.Name}, перенесена из родителя {oldParentGroupId} в родителя {group.ParentGroupId}, квоты ветки сброшены в 0, затронуто групп: {descendants.Count + 1}, прежняя квота группы: {oldQuota}"
                : $"Группа: {group.Name}, квота: {group.Quota}");
    }
    
    public async Task DeleteGroupAsync(long eventId, long userId, long groupId)
    {
        var group = await groupRepository.GetByIdAsync(groupId);
        if (group == null || group.EventId != eventId)
            throw new InvalidOperationException($"Group {groupId} not found");

        await eventStateGuard.EnsureActiveAsync(eventId);

        if (!group.ParentGroupId.HasValue)
            throw new InvalidOperationException("The root group cannot be deleted");

        await EnsureCanManageGroupAsync(eventId, userId, groupId);

        var descendants = await groupRepository.GetAllDescendantsAsync(groupId);
        var branch = descendants.Append(group).ToList();
        var branchGroupIds = branch.Select(branchGroup => branchGroup.Id).ToList();

        if (await userRepository.ExistsByGroupIdsAsync(branchGroupIds))
            throw new InvalidOperationException("Cannot delete a group branch that contains employees");

        if (await guestRepository.ExistsByGroupIdsAsync(branchGroupIds))
            throw new InvalidOperationException("Cannot delete a group branch that contains guests");

        var groupName = group.Name;

        foreach (var descendant in descendants.AsEnumerable().Reverse())
            await groupRepository.DeleteAsync(descendant.Id);

        await groupRepository.DeleteAsync(groupId);
        await groupRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            eventId,
            userId,
            "deleted",
            "Group",
            groupId,
            "Удалена группа",
            $"Группа: {groupName}");
    }

    public async Task<ResetGroupsResult> ResetGroupsAsync(long eventId, long userId)
    {
        await eventStateGuard.EnsureActiveAsync(eventId);

        if (!await permissionService.HasPermissionAsync(userId, eventId, "create_event"))
            throw new UnauthorizedAccessException("No permission to reset groups");

        var groups = await groupRepository.GetByEventIdAsync(eventId);
        var rootGroups = groups.Where(group => group.ParentGroupId == null).ToList();
        if (rootGroups.Count != 1)
            throw new InvalidOperationException("У мероприятия должна быть одна корневая группа.");

        var rootGroup = rootGroups[0];
        var groupsToDelete = groups
            .Where(group => group.Id != rootGroup.Id)
            .OrderByDescending(group => GetDepth(group, groups))
            .ToList();

        var users = await userRepository.GetByEventIdAsync(eventId);
        var usersMoved = 0;
        foreach (var user in users.Where(user => user.GroupId != rootGroup.Id))
        {
            user.GroupId = rootGroup.Id;
            await userRepository.UpdateAsync(user);
            usersMoved++;
        }

        var guests = await guestRepository.GetByEventIdAsync(eventId);
        var guestsMoved = 0;
        foreach (var guest in guests.Where(guest => guest.GroupId != rootGroup.Id))
        {
            guest.GroupId = rootGroup.Id;
            await guestRepository.UpdateAsync(guest);
            guestsMoved++;
        }

        rootGroup.Quota = DefaultRootQuota;
        await groupRepository.UpdateAsync(rootGroup);
        await groupRepository.SaveChangesAsync();

        foreach (var group in groupsToDelete)
            await groupRepository.DeleteAsync(group.Id);

        await groupRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            eventId,
            userId,
            "groups_reset",
            "Group",
            rootGroup.Id,
            "Группы сброшены",
            $"Удалено групп: {groupsToDelete.Count}, гостей перенесено: {guestsMoved}, сотрудников перенесено: {usersMoved}, квота корня: {DefaultRootQuota}");

        return new ResetGroupsResult(
            groupsToDelete.Count,
            guestsMoved,
            usersMoved,
            DefaultRootQuota);
    }

    private async Task EnsureCanManageGroupAsync(long eventId, long userId, long groupId)
    {
        if (!await permissionService.HasPermissionAsync(userId, eventId, "create_group"))
            throw new UnauthorizedAccessException("No permission to manage groups");

        var userGroupId = await permissionService.GetUserGroupInEventAsync(userId, eventId);
        if (!userGroupId.HasValue ||
            !await permissionService.CanCreateGroupInParentAsync(userId, eventId, groupId, userGroupId.Value))
        {
            throw new UnauthorizedAccessException("Cannot manage this group");
        }
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
}
