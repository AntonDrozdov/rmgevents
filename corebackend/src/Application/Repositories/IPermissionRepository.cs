namespace Application.Repositories;

public interface IPermissionRepository
{
    Task<Entities.Permission?> GetByIdAsync(Guid id);
    Task<Entities.Permission?> GetByCodeAsync(string code);
    Task<List<Entities.Permission>> GetAllAsync();
    Task<List<Entities.Permission>> GetByRoleIdAsync(Guid roleId);
    Task AddAsync(Entities.Permission permission);
    Task SaveChangesAsync();
}
