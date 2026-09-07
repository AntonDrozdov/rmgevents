using Application.Repositories;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public sealed class RoleRepository(ApplicationDbContext db) : IRoleRepository
{
    public async Task<Application.Entities.Role?> GetByIdAsync(long id)
    {
        return await db.Roles
            .Include(x => x.RolePermissions)
            .ThenInclude(x => x.Permission)
            .FirstOrDefaultAsync(x => x.Id == id);
    }
    
    public async Task<List<Application.Entities.Role>> GetAllAsync()
    {
        return await db.Roles
            .Include(x => x.RolePermissions)
            .ThenInclude(x => x.Permission)
            .OrderBy(x => x.Name)
            .ToListAsync();
    }
    
    public async Task<Application.Entities.Role?> GetByNameAsync(string name)
    {
        return await db.Roles
            .Include(x => x.RolePermissions)
            .ThenInclude(x => x.Permission)
            .FirstOrDefaultAsync(x => x.Name == name);
    }
    
    public async Task AddAsync(Application.Entities.Role role)
    {
        await db.Roles.AddAsync(role);
    }
    
    public async Task UpdateAsync(Application.Entities.Role role)
    {
        db.Roles.Update(role);
        await Task.CompletedTask;
    }
    
    public async Task DeleteAsync(long id)
    {
        var role = await db.Roles.FindAsync(id);
        if (role != null)
        {
            db.Roles.Remove(role);
        }
    }
    
    public async Task SaveChangesAsync()
    {
        await db.SaveChangesAsync();
    }
}
