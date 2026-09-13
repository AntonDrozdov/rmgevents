using Application.Repositories;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public sealed class EventLogRepository(ApplicationDbContext db) : IEventLogRepository
{
    public async Task<(List<Application.Entities.EventLog> Items, int TotalCount, int Page)> GetPageByEventIdAsync(
        long eventId,
        long? userId,
        string? action,
        string? entityType,
        string? search,
        DateTimeOffset? dateFrom,
        DateTimeOffset? dateTo,
        int page,
        int pageSize)
    {
        var query = db.EventLogs
            .AsNoTracking()
            .Where(log => log.EventId == eventId);

        if (userId.HasValue)
            query = query.Where(log => log.UserId == userId.Value);

        if (!string.IsNullOrWhiteSpace(action))
            query = query.Where(log => log.Action == action);

        if (!string.IsNullOrWhiteSpace(entityType))
            query = query.Where(log => log.EntityType == entityType);

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(log =>
                (log.Description != null && EF.Functions.ILike(log.Description, $"%{search}%")) ||
                EF.Functions.ILike(log.Title, $"%{search}%"));

        if (dateFrom.HasValue)
            query = query.Where(log => log.CreatedAt >= dateFrom.Value);

        if (dateTo.HasValue)
            query = query.Where(log => log.CreatedAt <= dateTo.Value);

        var totalCount = await query.CountAsync();
        var totalPages = Math.Max(1, (int)Math.Ceiling(totalCount / (double)pageSize));
        page = Math.Clamp(page, 1, totalPages);

        var items = await query
            .OrderByDescending(log => log.CreatedAt)
            .ThenByDescending(log => log.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return (items, totalCount, page);
    }

    public async Task<List<(long UserId, string ActorName)>> GetUserFilterOptionsAsync(long eventId)
    {
        var items = await db.EventLogs
            .AsNoTracking()
            .Where(log => log.EventId == eventId && log.UserId.HasValue)
            .GroupBy(log => new { UserId = log.UserId!.Value, log.ActorName })
            .Select(group => new { group.Key.UserId, group.Key.ActorName })
            .OrderBy(item => item.ActorName)
            .ToListAsync();

        return items.Select(item => (item.UserId, item.ActorName)).ToList();
    }

    public async Task<List<string>> GetActionFilterOptionsAsync(long eventId)
    {
        return await db.EventLogs
            .AsNoTracking()
            .Where(log => log.EventId == eventId)
            .Select(log => log.Action)
            .Distinct()
            .OrderBy(action => action)
            .ToListAsync();
    }

    public async Task<List<string>> GetEntityTypeFilterOptionsAsync(long eventId)
    {
        return await db.EventLogs
            .AsNoTracking()
            .Where(log => log.EventId == eventId)
            .Select(log => log.EntityType)
            .Distinct()
            .OrderBy(entityType => entityType)
            .ToListAsync();
    }

    public async Task AddAsync(Application.Entities.EventLog eventLog)
    {
        await db.EventLogs.AddAsync(eventLog);
    }

    public async Task SaveChangesAsync()
    {
        await db.SaveChangesAsync();
    }
}
