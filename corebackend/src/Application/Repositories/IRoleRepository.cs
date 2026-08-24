namespace Application.Repositories;

public interface IRoleRepository
{
    Task<Entities.Role?> GetByIdAsync(Guid id);
    Task<List<Entities.Role>> GetByEventIdAsync(Guid eventId);
    Task<Entities.Role?> GetByEventAndNameAsync(Guid eventId, string name);
    Task AddAsync(Entities.Role role);
    Task UpdateAsync(Entities.Role role);
    Task DeleteAsync(Guid id);
    Task SaveChangesAsync();
}
