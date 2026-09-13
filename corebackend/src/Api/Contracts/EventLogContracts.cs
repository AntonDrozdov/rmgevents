namespace Api.Contracts;

public sealed record EventLogDto(
    long Id,
    long EventId,
    long? UserId,
    string ActorName,
    string? ActorRoleName,
    string Action,
    string EntityType,
    long? EntityId,
    string Title,
    string? Description,
    DateTimeOffset CreatedAt);

public sealed record EventLogFilterOptionsDto(
    List<EventLogUserFilterOptionDto> Users,
    List<string> Actions,
    List<string> EntityTypes);

public sealed record EventLogUserFilterOptionDto(
    long UserId,
    string Name);
