using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed class PermissionService(
    IUserRepository userRepository,
    IGroupRepository groupRepository) : IPermissionService
{
    public async Task<bool> HasPermissionAsync(long loginId, long eventId, string permissionCode)
    {
        var user = await userRepository.GetByLoginAndEventAsync(loginId, eventId);

        if (user == null)
            return false;
        
        if (user.Role == null)
            return false;
        
        return user.Role.RolePermissions.Any(rp => rp.Permission?.Code == permissionCode);
    }

    public async Task<bool> HasPermissionInAnyEventAsync(long loginId, string permissionCode)
    {
        var users = await userRepository.GetByLoginIdAsync(loginId);

        return users.Any(user =>
            user.Role?.RolePermissions.Any(rp => rp.Permission?.Code == permissionCode) == true);
    }
    
    public async Task<List<string>> GetUserPermissionsAsync(long userId, long eventId)
    {
        var user = await userRepository.GetByIdAsync(userId);

        if (user == null || user.EventId != eventId || user.Role == null)
            return [];
        
        return user.Role.RolePermissions
            .Select(rp => rp.Permission!.Code)
            .ToList();
    }
    
    public async Task<long?> GetUserGroupInEventAsync(long loginId, long eventId)
    {
        var user = await userRepository.GetByLoginAndEventAsync(loginId, eventId);

        if (user == null)
            return null;
        
        return user.GroupId;
    }
    
    public async Task<bool> CanCreateGuestInGroupAsync(long userId, long eventId, long targetGroupId, long userGroupId)
    {
        // Пользователь может создавать гостей в своей группе и дочерних группах
        var targetGroup = await groupRepository.GetByIdAsync(targetGroupId);
        if (targetGroup == null || targetGroup.EventId != eventId)
            return false;
        
        // Если целевая группа = группе пользователя
        if (targetGroupId == userGroupId)
            return true;
        
        // Проверяем, является ли целевая группа потомком группы пользователя
        return await IsDescendantOfAsync(targetGroupId, userGroupId);
    }
    
    public async Task<bool> CanCreateGroupInParentAsync(long userId, long eventId, long parentGroupId, long userGroupId)
    {
        // Пользователь может создавать подгруппы только в своей группе и дочерних группах
        var parentGroup = await groupRepository.GetByIdAsync(parentGroupId);
        if (parentGroup == null || parentGroup.EventId != eventId)
            return false;
        
        // Если родительская группа = группе пользователя
        if (parentGroupId == userGroupId)
            return true;
        
        // Проверяем, является ли родительская группа потомком группы пользователя
        return await IsDescendantOfAsync(parentGroupId, userGroupId);
    }
    
    private async Task<bool> IsDescendantOfAsync(long childId, long parentId)
    {
        var current = await groupRepository.GetByIdAsync(childId);
        while (current?.ParentGroupId != null)
        {
            if (current.ParentGroupId == parentId)
                return true;
            current = await groupRepository.GetByIdAsync(current.ParentGroupId.Value);
        }
        return false;
    }
}
