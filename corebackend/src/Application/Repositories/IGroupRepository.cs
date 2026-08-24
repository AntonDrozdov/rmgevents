namespace Application.Repositories;

public interface IGroupRepository
{
    Task<Entities.Group?> GetByIdAsync(Guid id);
    Task<List<Entities.Group>> GetByEventIdAsync(Guid eventId);
    Task<List<Entities.Group>> GetRootGroupsByEventAsync(Guid eventId);
    Task<List<Entities.Group>> GetChildrenAsync(Guid groupId);
    Task<List<Entities.Group>> GetAllDescendantsAsync(Guid groupId);
    Task AddAsync(Entities.Group group);
    Task UpdateAsync(Entities.Group group);
    Task DeleteAsync(Guid id);
    Task SaveChangesAsync();
}
