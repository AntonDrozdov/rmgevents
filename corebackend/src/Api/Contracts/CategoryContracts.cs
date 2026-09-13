namespace Api.Contracts;

public sealed record CategoryDto(
    long Id,
    long EventId,
    string Name,
    string Color,
    DateTimeOffset CreatedAt);

public sealed record CreateCategoryRequest(
    string Name,
    string Color);

public sealed record UpdateCategoryRequest(
    string Name,
    string Color);
