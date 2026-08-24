namespace Application.Repositories;

public interface IEventRepository
{
    Task<Entities.Event?> GetByIdAsync(Guid id);
    Task<List<Entities.Event>> GetByOwnerIdAsync(Guid ownerId);
    Task<List<Entities.Event>> GetByUserAsync(Guid userId);
    Task AddAsync(Entities.Event @event);
    Task UpdateAsync(Entities.Event @event);
    Task DeleteAsync(Guid id);
    Task SaveChangesAsync();
}
