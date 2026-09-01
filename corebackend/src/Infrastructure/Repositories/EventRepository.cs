using Application.Repositories;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public sealed class EventRepository(ApplicationDbContext db) : IEventRepository
{
    public async Task<Application.Entities.Event?> GetByIdAsync(long id)
    {
        return await db.Events
            .Include(x => x.Owner)
            .Include(x => x.Roles)
            .Include(x => x.Groups)
            .Include(x => x.Users)
            .FirstOrDefaultAsync(x => x.Id == id);
    }
    
    public async Task<List<Application.Entities.Event>> GetByOwnerIdAsync(long ownerId)
    {
        return await db.Events
            .Where(x => x.OwnerId == ownerId)
            .Include(x => x.Owner)
            .ToListAsync();
    }
    
    public async Task<List<Application.Entities.Event>> GetByUserAsync(long userId)
    {
        return await db.Events
            .Where(x => x.Users.Any(u => u.LoginId == userId))
            .Include(x => x.Owner)
            .ToListAsync();
    }
    
    public async Task AddAsync(Application.Entities.Event @event)
    {
        await db.Events.AddAsync(@event);
    }
    
    public async Task UpdateAsync(Application.Entities.Event @event)
    {
        db.Events.Update(@event);
        await Task.CompletedTask;
    }
    
    public async Task DeleteAsync(long id)
    {
        var @event = await db.Events.FindAsync(id);
        if (@event != null)
        {
            db.Events.Remove(@event);
        }
    }
    
    public async Task SaveChangesAsync()
    {
        await db.SaveChangesAsync();
    }
}
