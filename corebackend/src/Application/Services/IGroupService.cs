namespace Application.Services;

public interface IGroupService
{
    Task<Entities.Group> CreateGroupAsync(Guid eventId, Guid userId, string name, int quota, Guid? parentGroupId);
    Task<Entities.Group?> GetGroupAsync(Guid groupId);
    Task<List<Entities.Group>> GetGroupsByEventAsync(Guid eventId);
    Task<List<Entities.Group>> GetGroupHierarchyAsync(Guid eventId);
    Task<int> GetAvailableQuotaAsync(Guid groupId);
    Task ValidateQuotaHierarchyAsync(Guid groupId, int newQuota);
    Task UpdateGroupAsync(Guid groupId, string name, int quota);
    Task DeleteGroupAsync(Guid groupId);
}
