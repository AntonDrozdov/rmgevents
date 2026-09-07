namespace Application.Repositories;

public interface IRoleRepository
{
    Task<Entities.Role?> GetByIdAsync(long id);
    Task<List<Entities.Role>> GetAllAsync();
    Task<Entities.Role?> GetByNameAsync(string name);
    Task AddAsync(Entities.Role role);
    Task UpdateAsync(Entities.Role role);
    Task DeleteAsync(long id);
    Task SaveChangesAsync();
}
