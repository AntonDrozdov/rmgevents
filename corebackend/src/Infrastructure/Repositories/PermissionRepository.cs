using Application.Repositories;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public sealed class PermissionRepository(ApplicationDbContext db) : IPermissionRepository
{
    public async Task<Application.Entities.Permission?> GetByIdAsync(Guid id)
    {
        return await db.Permissions.FindAsync(id);
    }
    
    public async Task<Application.Entities.Permission?> GetByCodeAsync(string code)
    {
        return await db.Permissions
            .FirstOrDefaultAsync(x => x.Code == code);
    }
    
    public async Task<List<Application.Entities.Permission>> GetAllAsync()
    {
        return await db.Permissions.ToListAsync();
    }
    
    public async Task<List<Application.Entities.Permission>> GetByRoleIdAsync(Guid roleId)
    {
        return await db.RolePermissions
            .Where(x => x.RoleId == roleId)
            .Select(x => x.Permission!)
            .ToListAsync();
    }
    
    public async Task AddAsync(Application.Entities.Permission permission)
    {
        await db.Permissions.AddAsync(permission);
    }
    
    public async Task SaveChangesAsync()
    {
        await db.SaveChangesAsync();
    }
}
