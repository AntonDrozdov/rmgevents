namespace Application.Repositories;

public interface IRoleRepository
{
    Task<Entities.Role?> GetByIdAsync(long id);
    Task<List<Entities.Role>> GetByEventIdAsync(long eventId);
    Task<Entities.Role?> GetByEventAndNameAsync(long eventId, string name);
    Task AddAsync(Entities.Role role);
    Task UpdateAsync(Entities.Role role);
    Task DeleteAsync(long id);
    Task SaveChangesAsync();
}
