namespace Application.Services;

public interface IGroupService
{
    Task<Entities.Group> CreateGroupAsync(long eventId, long userId, string name, int quota, long? parentGroupId);
    Task<Entities.Group?> GetGroupAsync(long groupId);
    Task<List<Entities.Group>> GetGroupsByEventAsync(long eventId);
    Task<List<Entities.Group>> GetGroupHierarchyAsync(long eventId);
    Task<int> GetAvailableQuotaAsync(long groupId);
    Task ValidateQuotaHierarchyAsync(long groupId, int newQuota);
    Task UpdateGroupAsync(long groupId, string name, int quota);
    Task DeleteGroupAsync(long groupId);
}
