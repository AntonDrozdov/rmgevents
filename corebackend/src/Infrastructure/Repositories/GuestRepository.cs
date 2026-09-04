using Application.Repositories;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public sealed class GuestRepository(ApplicationDbContext db) : IGuestRepository
{
    public async Task<Application.Entities.Guest?> GetByIdAsync(long id)
    {
        return await db.Guests
            .Include(x => x.Group)
            .Include(x => x.Decisions)
            .FirstOrDefaultAsync(x => x.Id == id);
    }
    
    public async Task<List<Application.Entities.Guest>> GetByEventIdAsync(long eventId)
    {
        return await db.Guests
            .Where(x => x.EventId == eventId)
            .Include(x => x.Group)
            .Include(x => x.Decisions)
            .ToListAsync();
    }
    
    public async Task<List<Application.Entities.Guest>> GetByGroupIdAsync(long groupId)
    {
        return await db.Guests
            .Where(x => x.GroupId == groupId)
            .ToListAsync();
    }
    
    public async Task<List<Application.Entities.Guest>> GetByStatusAsync(long eventId, string status)
    {
        return await db.Guests
            .Where(x => x.EventId == eventId && x.Status == status)
            .Include(x => x.Group)
            .ToListAsync();
    }
    
    public async Task<int> GetGuestCountByGroupAsync(long groupId)
    {
        return await db.Guests
            .Where(x => x.GroupId == groupId && x.Status != "rejected")
            .CountAsync();
    }
    
    public async Task AddAsync(Application.Entities.Guest guest)
    {
        await db.Guests.AddAsync(guest);
    }
    
    public async Task UpdateAsync(Application.Entities.Guest guest)
    {
        db.Guests.Update(guest);
        await Task.CompletedTask;
    }
    
    public async Task DeleteAsync(long id)
    {
        var guest = await db.Guests.FindAsync(id);
        if (guest != null)
        {
            db.Guests.Remove(guest);
        }
    }
    
    public async Task SaveChangesAsync()
    {
        await db.SaveChangesAsync();
    }
}
