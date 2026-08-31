using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed class GroupService(
    IGroupRepository groupRepository,
    IUserRepository userRepository,
    IGuestRepository guestRepository,
    IPermissionService permissionService) : IGroupService
{
    public async Task<Application.Entities.Group> CreateGroupAsync(
        long eventId,
        long userId,
        string name,
        int quota,
        long? parentGroupId)
    {
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
    
    public async Task UpdateGroupAsync(long eventId, long userId, long groupId, string name, int quota)
    {
        var group = await groupRepository.GetByIdAsync(groupId);
        if (group == null || group.EventId != eventId)
            throw new InvalidOperationException($"Group {groupId} not found");

        await EnsureCanManageGroupAsync(eventId, userId, groupId);
        
        await ValidateQuotaHierarchyAsync(groupId, quota);
        
        group.Name = name;
        group.Quota = quota;
        
        await groupRepository.UpdateAsync(group);
        await groupRepository.SaveChangesAsync();
    }
    
    public async Task DeleteGroupAsync(long eventId, long userId, long groupId)
    {
        var group = await groupRepository.GetByIdAsync(groupId);
        if (group == null || group.EventId != eventId)
            throw new InvalidOperationException($"Group {groupId} not found");

        if (!group.ParentGroupId.HasValue)
            throw new InvalidOperationException("The root group cannot be deleted");

        await EnsureCanManageGroupAsync(eventId, userId, groupId);

        var descendants = await groupRepository.GetAllDescendantsAsync(groupId);
        var branch = descendants.Append(group).ToList();

        foreach (var branchGroup in branch)
        {
            if ((await userRepository.GetByGroupIdAsync(branchGroup.Id)).Any())
                throw new InvalidOperationException("Cannot delete a group branch that contains employees");

            if ((await guestRepository.GetByGroupIdAsync(branchGroup.Id)).Any())
                throw new InvalidOperationException("Cannot delete a group branch that contains guests");
        }

        foreach (var descendant in descendants.AsEnumerable().Reverse())
            await groupRepository.DeleteAsync(descendant.Id);

        await groupRepository.DeleteAsync(groupId);
        await groupRepository.SaveChangesAsync();
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
}
