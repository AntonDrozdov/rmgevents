namespace Api.Contracts;

public sealed record TagDto(
    long Id,
    long EventId,
    string Name,
    string Color,
    DateTimeOffset CreatedAt);

public sealed record GuestTagDto(
    long Id,
    string Name,
    string Color);

public sealed record CreateTagRequest(
    string Name,
    string Color);

public sealed record UpdateTagRequest(
    string Name,
    string Color);
