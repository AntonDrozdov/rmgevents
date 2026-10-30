using Application.Repositories;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public sealed class GuestRepository(ApplicationDbContext db) : IGuestRepository
{
    private static string DigitsOnly(string value) =>
        new(value.Where(char.IsDigit).ToArray());

    public async Task<Application.Entities.Guest?> GetByIdAsync(long id, bool includeDeleted = false)
    {
        IQueryable<Application.Entities.Guest> query = db.Guests;
        if (includeDeleted)
            query = query.IgnoreQueryFilters();

        return await query
            .Include(x => x.Group)
            .Include(x => x.CreatedByUser)
            .ThenInclude(x => x!.Role)
            .Include(x => x.DeletedByUser)
            .Include(x => x.GuestCategory)
            .ThenInclude(x => x!.Category)
            .Include(x => x.GuestTags)
            .ThenInclude(x => x.Tag)
            .Include(x => x.Decisions)
            .FirstOrDefaultAsync(x => x.Id == id);
    }

    public async Task<Application.Entities.Guest?> GetByPublicIdAsync(Guid publicId)
    {
        return await db.Guests.AsNoTracking()
            .Include(x => x.Group)
            .Include(x => x.GuestCategory).ThenInclude(x => x!.Category)
            .Include(x => x.GuestTags).ThenInclude(x => x.Tag)
            .FirstOrDefaultAsync(x => x.PublicId == publicId);
    }
    
    public async Task<List<Application.Entities.Guest>> GetByEventIdAsync(long eventId)
    {
        return await db.Guests
            .Where(x => x.EventId == eventId)
            .Include(x => x.Group)
            .Include(x => x.CreatedByUser)
            .ThenInclude(x => x!.Role)
            .Include(x => x.GuestCategory)
            .ThenInclude(x => x!.Category)
            .Include(x => x.GuestTags)
            .ThenInclude(x => x.Tag)
            .Include(x => x.Decisions)
            .ToListAsync();
    }

    public async Task<(List<Application.Entities.Guest> Items, int TotalCount, int Page)> GetPageByEventIdAsync(
        long eventId,
        string? search,
        IReadOnlyCollection<string> statuses,
        bool eligibleForSeating,
        IReadOnlyCollection<long> categoryIds,
        IReadOnlyCollection<long> tagIds,
        IReadOnlyCollection<long> groupIds,
        IReadOnlyCollection<long> createdByUserIds,
        bool includeDeleted,
        string? sortBy,
        bool sortDescending,
        int page,
        int pageSize)
    {
        IQueryable<Application.Entities.Guest> query = db.Guests.AsNoTracking();
        if (includeDeleted)
            query = query.IgnoreQueryFilters();
        query = query.Where(guest => guest.EventId == eventId);

        if (statuses.Count > 0)
        {
            query = query.Where(guest => statuses.Contains(guest.Status));
        }

        if (eligibleForSeating)
        {
            query = query.Where(guest => guest.Status == "approved" || guest.Status == "invited");
        }

        if (categoryIds.Count > 0)
        {
            query = query.Where(guest =>
                guest.GuestCategory != null &&
                categoryIds.Contains(guest.GuestCategory.CategoryId));
        }

        if (tagIds.Count > 0)
        {
            query = query.Where(guest => guest.GuestTags.Any(guestTag => tagIds.Contains(guestTag.TagId)));
        }

        if (groupIds.Count > 0)
        {
            query = query.Where(guest => groupIds.Contains(guest.GroupId));
        }

        if (createdByUserIds.Count > 0)
        {
            query = query.Where(guest => createdByUserIds.Contains(guest.CreatedByUserId));
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

        if (sortBy == "name")
        {
            query = sortDescending
                ? query.OrderByDescending(guest => guest.Name).ThenByDescending(guest => guest.Id)
                : query.OrderBy(guest => guest.Name).ThenBy(guest => guest.Id);
        }
        else if (sortBy == "status")
        {
            query = sortDescending
                ? query.OrderByDescending(guest => guest.Status == "saved" ? 0
                    : guest.Status == "on_review" ? 1
                    : guest.Status == "admin_review" ? 2
                    : guest.Status == "approved" ? 3
                    : guest.Status == "invited" ? 4
                    : guest.Status == "rejected" ? 5 : 6)
                    .ThenByDescending(guest => guest.CreatedAt)
                : query.OrderBy(guest => guest.Status == "saved" ? 0
                    : guest.Status == "on_review" ? 1
                    : guest.Status == "admin_review" ? 2
                    : guest.Status == "approved" ? 3
                    : guest.Status == "invited" ? 4
                    : guest.Status == "rejected" ? 5 : 6)
                    .ThenBy(guest => guest.CreatedAt);
        }
        else if (sortBy == "category")
        {
            query = sortDescending
                ? query.OrderBy(guest => guest.GuestCategory == null)
                    .ThenByDescending(guest => guest.GuestCategory!.Category!.Name)
                    .ThenByDescending(guest => guest.Id)
                : query.OrderBy(guest => guest.GuestCategory == null)
                    .ThenBy(guest => guest.GuestCategory!.Category!.Name)
                    .ThenBy(guest => guest.Id);
        }
        else if (sortBy == "group")
        {
            query = sortDescending
                ? query.OrderByDescending(guest => guest.Group!.Name).ThenByDescending(guest => guest.Id)
                : query.OrderBy(guest => guest.Group!.Name).ThenBy(guest => guest.Id);
        }
        else if (sortBy == "placement")
        {
            query = sortDescending
                ? query.OrderBy(guest => !guest.PlacementId.HasValue)
                    .ThenByDescending(guest => db.Placements.Where(placement => placement.Id == guest.PlacementId).Select(placement => placement.Name).FirstOrDefault())
                    .ThenByDescending(guest => guest.PlacementSeatNumber)
                    .ThenByDescending(guest => guest.Id)
                : query.OrderBy(guest => !guest.PlacementId.HasValue)
                    .ThenBy(guest => db.Placements.Where(placement => placement.Id == guest.PlacementId).Select(placement => placement.Name).FirstOrDefault())
                    .ThenBy(guest => guest.PlacementSeatNumber)
                    .ThenBy(guest => guest.Id);
        }
        else if (sortBy == "createdBy")
        {
            query = sortDescending
                ? query.OrderByDescending(guest => guest.CreatedByUser!.Surname)
                    .ThenByDescending(guest => guest.CreatedByUser!.Name)
                    .ThenByDescending(guest => guest.CreatedByUser!.AdditionalName)
                    .ThenByDescending(guest => guest.Id)
                : query.OrderBy(guest => guest.CreatedByUser!.Surname)
                    .ThenBy(guest => guest.CreatedByUser!.Name)
                    .ThenBy(guest => guest.CreatedByUser!.AdditionalName)
                    .ThenBy(guest => guest.Id);
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
        else if (sortBy == null)
        {
            query = query.OrderByDescending(guest => guest.CreatedAt);
        }

        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Include(guest => guest.Group)
            .Include(guest => guest.CreatedByUser)
            .ThenInclude(user => user!.Role)
            .Include(guest => guest.DeletedByUser)
            .Include(guest => guest.GuestCategory)
            .ThenInclude(guestCategory => guestCategory!.Category)
            .Include(guest => guest.GuestTags)
            .ThenInclude(guestTag => guestTag.Tag)
            .Include(guest => guest.Decisions)
            .AsSplitQuery()
            .ToListAsync();

        return (items, totalCount, page);
    }

    public async Task<List<Application.Entities.Guest>> GetForBulkAsync(long eventId, GuestSelection selection)
    {
        IQueryable<Application.Entities.Guest> query = db.Guests.IgnoreQueryFilters()
            .Where(guest => guest.EventId == eventId);

        if (selection.SelectAllMatching)
        {
            if (!selection.IncludeDeleted)
                query = query.Where(guest => !guest.IsDeleted);
            if (selection.Statuses.Count > 0)
                query = query.Where(guest => selection.Statuses.Contains(guest.Status));
            if (selection.CategoryIds.Count > 0)
                query = query.Where(guest => guest.GuestCategory != null && selection.CategoryIds.Contains(guest.GuestCategory.CategoryId));
            if (selection.TagIds.Count > 0)
                query = query.Where(guest => guest.GuestTags.Any(tag => selection.TagIds.Contains(tag.TagId)));
            if (selection.GroupIds.Count > 0)
                query = query.Where(guest => selection.GroupIds.Contains(guest.GroupId));
            if (selection.CreatedByUserIds.Count > 0)
                query = query.Where(guest => selection.CreatedByUserIds.Contains(guest.CreatedByUserId));
            if (selection.ExcludedGuestIds.Count > 0)
                query = query.Where(guest => !selection.ExcludedGuestIds.Contains(guest.Id));

            var search = selection.Search?.Trim();
            if (!string.IsNullOrWhiteSpace(search))
            {
                var digits = DigitsOnly(search);
                var hasDigits = digits.Length >= 2;
                query = query.Where(guest =>
                    EF.Functions.ILike(guest.Name, $"%{search}%") ||
                    (guest.Email != null && EF.Functions.ILike(guest.Email, $"%{search}%")) ||
                    (guest.Phone != null && (EF.Functions.ILike(guest.Phone, $"%{search}%") ||
                        (hasDigits && EF.Functions.Like(ApplicationDbContext.RegexpReplace(guest.Phone, "[^0-9]", "", "g"), $"%{digits}%")))));
            }
        }
        else
        {
            query = query.Where(guest => selection.GuestIds.Contains(guest.Id));
        }

        return await query
            .Include(guest => guest.Group)
            .Include(guest => guest.CreatedByUser).ThenInclude(user => user!.Role)
            .Include(guest => guest.DeletedByUser)
            .Include(guest => guest.GuestCategory).ThenInclude(category => category!.Category)
            .Include(guest => guest.GuestTags).ThenInclude(tag => tag.Tag)
            .Include(guest => guest.Decisions)
            .AsSplitQuery()
            .ToListAsync();
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

    public async Task SetGuestCategoryAsync(long guestId, long? categoryId)
    {
        var current = await db.GuestCategories.FindAsync(guestId);

        if (categoryId.HasValue)
        {
            if (current == null)
            {
                await db.GuestCategories.AddAsync(new Application.Entities.GuestCategory
                {
                    GuestId = guestId,
                    CategoryId = categoryId.Value
                });
            }
            else
            {
                current.CategoryId = categoryId.Value;
                db.GuestCategories.Update(current);
            }

            return;
        }

        if (current != null)
        {
            db.GuestCategories.Remove(current);
        }
    }

    public async Task SetGuestTagsAsync(long guestId, IReadOnlyCollection<long> tagIds)
    {
        var current = await db.GuestTags
            .Where(x => x.GuestId == guestId)
            .ToListAsync();
        db.GuestTags.RemoveRange(current);

        if (tagIds.Count == 0)
            return;

        var distinctIds = tagIds.Distinct().ToList();
        await db.GuestTags.AddRangeAsync(distinctIds.Select(tagId => new Application.Entities.GuestTag
        {
            GuestId = guestId,
            TagId = tagId
        }));
    }
    
    public async Task SaveChangesAsync()
    {
        await db.SaveChangesAsync();
    }
}
