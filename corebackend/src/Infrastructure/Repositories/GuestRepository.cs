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

    public async Task<(List<Application.Entities.Guest> Items, int TotalCount, int Page)> GetPageByEventIdAsync(
        long eventId,
        string? search,
        int page,
        int pageSize)
    {
        var query = db.Guests
            .AsNoTracking()
            .Where(guest => guest.EventId == eventId);

        var hasSearch = !string.IsNullOrWhiteSpace(search);
        if (hasSearch)
        {
            query = query.Where(guest =>
                EF.Functions.ILike(guest.Name, $"%{search}%") ||
                (guest.Email != null && EF.Functions.ILike(guest.Email, $"%{search}%")) ||
                (guest.Phone != null && EF.Functions.ILike(guest.Phone, $"%{search}%")));
        }

        var totalCount = await query.CountAsync();
        var totalPages = Math.Max(1, (int)Math.Ceiling(totalCount / (double)pageSize));
        page = Math.Min(page, totalPages);

        if (hasSearch)
        {
            query = query
                .OrderByDescending(guest =>
                    (EF.Functions.ILike(guest.Name, search!) ? 100 :
                        EF.Functions.ILike(guest.Name, $"{search}%") ? 20 :
                        EF.Functions.ILike(guest.Name, $"%{search}%") ? 5 : 0)
                    + (guest.Email != null && EF.Functions.ILike(guest.Email, search!) ? 100 :
                        guest.Email != null && EF.Functions.ILike(guest.Email, $"{search}%") ? 20 :
                        guest.Email != null && EF.Functions.ILike(guest.Email, $"%{search}%") ? 5 : 0)
                    + (guest.Phone != null && EF.Functions.ILike(guest.Phone, search!) ? 100 :
                        guest.Phone != null && EF.Functions.ILike(guest.Phone, $"{search}%") ? 20 :
                        guest.Phone != null && EF.Functions.ILike(guest.Phone, $"%{search}%") ? 5 : 0))
                .ThenByDescending(guest => guest.CreatedAt);
        }
        else
        {
            query = query.OrderByDescending(guest => guest.CreatedAt);
        }

        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Include(guest => guest.Group)
            .Include(guest => guest.Decisions)
            .AsSplitQuery()
            .ToListAsync();

        return (items, totalCount, page);
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

    public async Task<List<Application.Entities.Guest>> SearchForEventAsync(
        long eventId,
        string? name,
        string? email,
        string? phone,
        int limit)
    {
        var query = db.Guests
            .AsNoTracking()
            .Where(guest => guest.EventId != eventId)
            .Include(guest => guest.Group)
            .AsQueryable();

        var hasName = !string.IsNullOrWhiteSpace(name);
        var hasEmail = !string.IsNullOrWhiteSpace(email);
        var hasPhone = !string.IsNullOrWhiteSpace(phone);

        if (!hasName && !hasEmail && !hasPhone)
            return [];

        query = query.Where(guest =>
            (hasName && EF.Functions.ILike(guest.Name, $"%{name}%")) ||
            (hasEmail && guest.Email != null && EF.Functions.ILike(guest.Email, $"%{email}%")) ||
            (hasPhone && guest.Phone != null && EF.Functions.ILike(guest.Phone, $"%{phone}%")));

        var candidates = await query
            .OrderByDescending(guest => guest.CreatedAt)
            .Take(limit * 5)
            .ToListAsync();

        static int MatchScore(string? value, string? searchValue)
        {
            if (string.IsNullOrWhiteSpace(value) || string.IsNullOrWhiteSpace(searchValue))
                return 0;
            if (string.Equals(value, searchValue, StringComparison.OrdinalIgnoreCase))
                return 100;
            if (value.StartsWith(searchValue, StringComparison.OrdinalIgnoreCase))
                return 20;
            return value.Contains(searchValue, StringComparison.OrdinalIgnoreCase) ? 5 : 0;
        }

        return candidates
            .Select(guest => new
            {
                Guest = guest,
                Score = MatchScore(guest.Name, name)
                    + MatchScore(guest.Email, email)
                    + MatchScore(guest.Phone, phone)
            })
            .OrderByDescending(item => item.Score)
            .ThenByDescending(item => item.Guest.CreatedAt)
            .Take(limit)
            .Select(item => item.Guest)
            .ToList();
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
