namespace Application.Repositories;

public interface IEventLogRepository
{
    Task<(List<Entities.EventLog> Items, int TotalCount, int Page)> GetPageByEventIdAsync(
        long eventId,
        long? userId,
        string? action,
        string? entityType,
        string? search,
        DateTimeOffset? dateFrom,
        DateTimeOffset? dateTo,
        int page,
        int pageSize);

    Task<List<(long UserId, string ActorName)>> GetUserFilterOptionsAsync(long eventId);
    Task<List<string>> GetActionFilterOptionsAsync(long eventId);
    Task<List<string>> GetEntityTypeFilterOptionsAsync(long eventId);
    Task AddAsync(Entities.EventLog eventLog);
    Task SaveChangesAsync();
}
