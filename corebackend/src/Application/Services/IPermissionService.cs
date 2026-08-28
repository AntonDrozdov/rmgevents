namespace Application.Services;

public interface IPermissionService
{
    Task<bool> HasPermissionAsync(long userId, long eventId, string permissionCode);
    Task<bool> HasPermissionInAnyEventAsync(long loginOrUserId, string permissionCode);
    Task<List<string>> GetUserPermissionsAsync(long userId, long eventId);
    Task<long?> GetUserGroupInEventAsync(long userId, long eventId);
    Task<bool> CanCreateGuestInGroupAsync(long userId, long eventId, long targetGroupId, long userGroupId);
    Task<bool> CanCreateGroupInParentAsync(long userId, long eventId, long parentGroupId, long userGroupId);
}
