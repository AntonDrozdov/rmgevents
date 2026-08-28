namespace Application.Repositories;

public interface IGroupRepository
{
    Task<Entities.Group?> GetByIdAsync(long id);
    Task<List<Entities.Group>> GetByEventIdAsync(long eventId);
    Task<List<Entities.Group>> GetRootGroupsByEventAsync(long eventId);
    Task<List<Entities.Group>> GetChildrenAsync(long groupId);
    Task<List<Entities.Group>> GetAllDescendantsAsync(long groupId);
    Task AddAsync(Entities.Group group);
    Task UpdateAsync(Entities.Group group);
    Task DeleteAsync(long id);
    Task SaveChangesAsync();
}
