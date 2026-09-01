namespace Application.Services;

public interface IPermissionService
{
    Task<bool> HasPermissionAsync(long loginId, long eventId, string permissionCode);
    Task<bool> HasPermissionInAnyEventAsync(long loginId, string permissionCode);
    Task<List<string>> GetUserPermissionsAsync(long userId, long eventId);
    Task<long?> GetUserGroupInEventAsync(long loginId, long eventId);
    Task<bool> CanCreateGuestInGroupAsync(long userId, long eventId, long targetGroupId, long userGroupId);
    Task<bool> CanCreateGroupInParentAsync(long userId, long eventId, long parentGroupId, long userGroupId);
}
