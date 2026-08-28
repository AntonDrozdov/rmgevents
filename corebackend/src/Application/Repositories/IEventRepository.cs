namespace Application.Repositories;

public interface IEventRepository
{
    Task<Entities.Event?> GetByIdAsync(long id);
    Task<List<Entities.Event>> GetByOwnerIdAsync(long ownerId);
    Task<List<Entities.Event>> GetByUserAsync(long userId);
    Task AddAsync(Entities.Event @event);
    Task UpdateAsync(Entities.Event @event);
    Task DeleteAsync(long id);
    Task SaveChangesAsync();
}
