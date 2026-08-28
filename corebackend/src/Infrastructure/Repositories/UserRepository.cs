using Application.Repositories;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public sealed class UserRepository(ApplicationDbContext db) : IUserRepository
{
    public async Task<Application.Entities.User?> GetByIdAsync(long id)
    {
        return await db.Users
            .Include(x => x.Role)
            .ThenInclude(x => x!.RolePermissions)
            .ThenInclude(x => x.Permission)
            .Include(x => x.Group)
            .FirstOrDefaultAsync(x => x.Id == id);
    }
    
    public async Task<List<Application.Entities.User>> GetByLoginIdAsync(long loginId)
    {
        return await db.Users
            .Where(x => x.LoginId == loginId)
            .Include(x => x.Event)
            .Include(x => x.Role)
            .Include(x => x.Group)
            .ToListAsync();
    }
    
    public async Task<Application.Entities.User?> GetByLoginAndEventAsync(long loginId, long eventId)
    {
        return await db.Users
            .Where(x => x.LoginId == loginId && x.EventId == eventId)
            .Include(x => x.Role)
            .ThenInclude(x => x!.RolePermissions)
            .ThenInclude(x => x.Permission)
            .Include(x => x.Group)
            .FirstOrDefaultAsync();
    }
    
    public async Task<List<Application.Entities.User>> GetByEventIdAsync(long eventId)
    {
        return await db.Users
            .Where(x => x.EventId == eventId)
            .Include(x => x.Role)
            .Include(x => x.Group)
            .ToListAsync();
    }
    
    public async Task<List<Application.Entities.User>> GetByGroupIdAsync(long groupId)
    {
        return await db.Users
            .Where(x => x.GroupId == groupId)
            .Include(x => x.Role)
            .ToListAsync();
    }
    
    public async Task AddAsync(Application.Entities.User user)
    {
        await db.Users.AddAsync(user);
    }
    
    public async Task UpdateAsync(Application.Entities.User user)
    {
        db.Users.Update(user);
        await Task.CompletedTask;
    }
    
    public async Task DeleteAsync(long id)
    {
        var user = await db.Users.FindAsync(id);
        if (user != null)
        {
            db.Users.Remove(user);
        }
    }
    
    public async Task SaveChangesAsync()
    {
        await db.SaveChangesAsync();
    }
}
