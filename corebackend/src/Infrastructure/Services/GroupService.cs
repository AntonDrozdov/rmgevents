using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed class GroupService(
    IGroupRepository groupRepository,
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
        await ValidateQuotaHierarchyAsync(actualParentId, quota);
        
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
        return await groupRepository.GetRootGroupsByEventAsync(eventId);
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
        var group = await groupRepository.GetByIdAsync(groupId);
        if (group == null)
            throw new InvalidOperationException($"Group {groupId} not found");
        
        var children = await groupRepository.GetChildrenAsync(groupId);
        var childrenQuotaSum = children.Sum(g => g.Quota);
        
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
                var siblingsQuotaSum = siblings.Where(s => s.Id != groupId).Sum(s => s.Quota);
                var newParentUsed = siblingsQuotaSum + newQuota;
                
                if (newParentUsed > parent.Quota)
                    throw new InvalidOperationException(
                        $"Children quotas sum would exceed parent quota");
            }
        }
    }
    
    public async Task UpdateGroupAsync(long groupId, string name, int quota)
    {
        var group = await groupRepository.GetByIdAsync(groupId);
        if (group == null)
            throw new InvalidOperationException($"Group {groupId} not found");
        
        await ValidateQuotaHierarchyAsync(groupId, quota);
        
        group.Name = name;
        group.Quota = quota;
        
        await groupRepository.UpdateAsync(group);
        await groupRepository.SaveChangesAsync();
    }
    
    public async Task DeleteGroupAsync(long groupId)
    {
        var group = await groupRepository.GetByIdAsync(groupId);
        if (group == null)
            throw new InvalidOperationException($"Group {groupId} not found");
        
        var children = await groupRepository.GetChildrenAsync(groupId);
        if (children.Any())
            throw new InvalidOperationException("Cannot delete group with child groups");
        
        await groupRepository.DeleteAsync(groupId);
        await groupRepository.SaveChangesAsync();
    }
}
