namespace Application.Services;

public sealed record EventLogFilterOptions(
    List<EventLogUserFilterOption> Users,
    List<string> Actions,
    List<string> EntityTypes);

public sealed record EventLogUserFilterOption(
    long UserId,
    string Name);

public interface IEventLogService
{
    Task AddAsync(
        long eventId,
        long? actorLoginId,
        string action,
        string entityType,
        long? entityId,
        string title,
        string? description = null);

    Task<(List<Entities.EventLog> Items, int TotalCount, int Page, int PageSize)> GetPageByEventIdAsync(
        long eventId,
        long loginId,
        int page,
        int pageSize,
        long? userId = null,
        string? action = null,
        string? entityType = null,
        string? search = null,
        DateTimeOffset? dateFrom = null,
        DateTimeOffset? dateTo = null);

    Task<EventLogFilterOptions> GetFilterOptionsAsync(long eventId, long loginId);
}
