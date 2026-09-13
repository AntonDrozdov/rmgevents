using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed class EventLogService(
    IEventLogRepository eventLogRepository,
    IUserRepository userRepository) : IEventLogService
{
    public async Task AddAsync(
        long eventId,
        long? actorLoginId,
        string action,
        string entityType,
        long? entityId,
        string title,
        string? description = null)
    {
        Application.Entities.User? actor = null;
        if (actorLoginId.HasValue)
            actor = await userRepository.GetByLoginAndEventAsync(actorLoginId.Value, eventId);

        var eventLog = new Application.Entities.EventLog
        {
            EventId = eventId,
            UserId = actor?.Id,
            ActorName = actor == null ? "Система" : FormatUserName(actor),
            ActorRoleName = actor?.Role?.Name,
            Action = Normalize(action, 64),
            EntityType = Normalize(entityType, 64),
            EntityId = entityId,
            Title = Normalize(title, 255),
            Description = NormalizeOptional(description, 2000),
            CreatedAt = DateTimeOffset.UtcNow
        };

        await eventLogRepository.AddAsync(eventLog);
        await eventLogRepository.SaveChangesAsync();
    }

    public async Task<(List<Application.Entities.EventLog> Items, int TotalCount, int Page, int PageSize)> GetPageByEventIdAsync(
        long eventId,
        long loginId,
        int page,
        int pageSize,
        long? userId = null,
        string? action = null,
        string? entityType = null,
        string? search = null,
        DateTimeOffset? dateFrom = null,
        DateTimeOffset? dateTo = null)
    {
        await EnsureUserInEventAsync(loginId, eventId);

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var result = await eventLogRepository.GetPageByEventIdAsync(
            eventId,
            userId,
            NormalizeFilter(action),
            NormalizeFilter(entityType),
            NormalizeSearch(search),
            dateFrom,
            dateTo,
            page,
            pageSize);

        return (result.Items, result.TotalCount, result.Page, pageSize);
    }

    public async Task<EventLogFilterOptions> GetFilterOptionsAsync(long eventId, long loginId)
    {
        await EnsureUserInEventAsync(loginId, eventId);

        var users = await eventLogRepository.GetUserFilterOptionsAsync(eventId);
        var actions = await eventLogRepository.GetActionFilterOptionsAsync(eventId);
        var entityTypes = await eventLogRepository.GetEntityTypeFilterOptionsAsync(eventId);

        return new EventLogFilterOptions(
            users.Select(user => new EventLogUserFilterOption(user.UserId, user.ActorName)).ToList(),
            actions,
            entityTypes);
    }

    private async Task EnsureUserInEventAsync(long loginId, long eventId)
    {
        if (await userRepository.GetByLoginAndEventAsync(loginId, eventId) == null)
            throw new UnauthorizedAccessException("User is not assigned to this event");
    }

    private static string FormatUserName(Application.Entities.User user)
    {
        var fullName = string.Join(" ", new[] { user.Surname, user.Name, user.AdditionalName }
            .Where(value => !string.IsNullOrWhiteSpace(value)));

        return string.IsNullOrWhiteSpace(fullName) ? user.Login?.LoginValue ?? "Система" : fullName;
    }

    private static string Normalize(string value, int maxLength)
    {
        var normalized = value.Trim();
        if (normalized.Length == 0)
            throw new InvalidOperationException("Event log value is required");

        return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
    }

    private static string? NormalizeOptional(string? value, int maxLength)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
    }

    private static string? NormalizeFilter(string? value)
    {
        var normalized = value?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    private static string? NormalizeSearch(string? value)
    {
        var normalized = value?.Trim();
        return normalized is { Length: >= 2 } ? normalized : null;
    }
}
