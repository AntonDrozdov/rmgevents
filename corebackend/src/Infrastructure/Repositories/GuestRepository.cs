using Application.Repositories;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public sealed class GuestRepository(ApplicationDbContext db) : IGuestRepository
{
    private static string DigitsOnly(string value) =>
        new(value.Where(char.IsDigit).ToArray());

    public async Task<Application.Entities.Guest?> GetByIdAsync(long id)
    {
        return await db.Guests
            .Include(x => x.Group)
            .Include(x => x.CreatedByUser)
            .ThenInclude(x => x!.Role)
            .Include(x => x.Decisions)
            .FirstOrDefaultAsync(x => x.Id == id);
    }
    
    public async Task<List<Application.Entities.Guest>> GetByEventIdAsync(long eventId)
    {
        return await db.Guests
            .Where(x => x.EventId == eventId)
            .Include(x => x.Group)
            .Include(x => x.CreatedByUser)
            .ThenInclude(x => x!.Role)
            .Include(x => x.Decisions)
            .ToListAsync();
    }

    public async Task<(List<Application.Entities.Guest> Items, int TotalCount, int Page)> GetPageByEventIdAsync(
        long eventId,
        string? search,
        string? status,
        int page,
        int pageSize)
    {
        var query = db.Guests
            .AsNoTracking()
            .Where(guest => guest.EventId == eventId);

        if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(guest => guest.Status == status);
        }

        var trimmedSearch = search?.Trim();
        var hasSearch = !string.IsNullOrWhiteSpace(trimmedSearch);
        var searchDigits = hasSearch ? DigitsOnly(trimmedSearch!) : string.Empty;
        var hasPhoneDigits = searchDigits.Length >= 2;
        if (hasSearch)
        {
            query = query.Where(guest =>
                EF.Functions.ILike(guest.Name, $"%{trimmedSearch}%") ||
                (guest.Email != null && EF.Functions.ILike(guest.Email, $"%{trimmedSearch}%")) ||
                (guest.Phone != null && (
                    EF.Functions.ILike(guest.Phone, $"%{trimmedSearch}%") ||
                    (hasPhoneDigits && EF.Functions.Like(
                        ApplicationDbContext.RegexpReplace(guest.Phone, "[^0-9]", "", "g"),
                        $"%{searchDigits}%")))));
        }

        var totalCount = await query.CountAsync();
        var totalPages = Math.Max(1, (int)Math.Ceiling(totalCount / (double)pageSize));
        page = Math.Min(page, totalPages);

        if (hasSearch)
        {
            query = query
                .OrderByDescending(guest =>
                    (EF.Functions.ILike(guest.Name, trimmedSearch!) ? 100 :
                        EF.Functions.ILike(guest.Name, $"{trimmedSearch}%") ? 20 :
                        EF.Functions.ILike(guest.Name, $"%{trimmedSearch}%") ? 5 : 0)
                    + (guest.Email != null && EF.Functions.ILike(guest.Email, trimmedSearch!) ? 100 :
                        guest.Email != null && EF.Functions.ILike(guest.Email, $"{trimmedSearch}%") ? 20 :
                        guest.Email != null && EF.Functions.ILike(guest.Email, $"%{trimmedSearch}%") ? 5 : 0)
                    + (guest.Phone != null && EF.Functions.ILike(guest.Phone, trimmedSearch!) ? 100 :
                        guest.Phone != null && EF.Functions.ILike(guest.Phone, $"{trimmedSearch}%") ? 20 :
                        guest.Phone != null && EF.Functions.ILike(guest.Phone, $"%{trimmedSearch}%") ? 5 : 0)
                    + (hasPhoneDigits && guest.Phone != null && EF.Functions.Like(
                        ApplicationDbContext.RegexpReplace(guest.Phone, "[^0-9]", "", "g"),
                        searchDigits) ? 100 :
                        hasPhoneDigits && guest.Phone != null && EF.Functions.Like(
                            ApplicationDbContext.RegexpReplace(guest.Phone, "[^0-9]", "", "g"),
                            $"{searchDigits}%") ? 20 :
                        hasPhoneDigits && guest.Phone != null && EF.Functions.Like(
                            ApplicationDbContext.RegexpReplace(guest.Phone, "[^0-9]", "", "g"),
                            $"%{searchDigits}%") ? 5 : 0))
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
            .Include(guest => guest.CreatedByUser)
            .ThenInclude(user => user!.Role)
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

    public async Task<bool> ExistsByGroupIdsAsync(IReadOnlyCollection<long> groupIds)
    {
        if (groupIds.Count == 0)
            return false;

        return await db.Guests.AnyAsync(guest => groupIds.Contains(guest.GroupId));
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
            .Include(guest => guest.Event)
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
