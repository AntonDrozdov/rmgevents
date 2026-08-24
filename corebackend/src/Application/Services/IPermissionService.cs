namespace Application.Services;

public interface IPermissionService
{
    Task<bool> HasPermissionAsync(Guid userId, Guid eventId, string permissionCode);
    Task<bool> HasPermissionInAnyEventAsync(Guid loginOrUserId, string permissionCode);
    Task<List<string>> GetUserPermissionsAsync(Guid userId, Guid eventId);
    Task<Guid?> GetUserGroupInEventAsync(Guid userId, Guid eventId);
    Task<bool> CanCreateGuestInGroupAsync(Guid userId, Guid eventId, Guid targetGroupId, Guid userGroupId);
    Task<bool> CanCreateGroupInParentAsync(Guid userId, Guid eventId, Guid parentGroupId, Guid userGroupId);
}
