namespace Api.Contracts;

public sealed record UserDto(
    long Id,
    long LoginId,
    long EventId,
    long RoleId,
    long GroupId,
    string Name,
    string Surname,
    string? AdditionalName,
    string? Email,
    string? Tel,
    DateTimeOffset CreatedAt);

public sealed record CreateUserRequest(
    long LoginId,
    string Name,
    string Surname,
    string? AdditionalName,
    string? Email,
    string? Tel,
    long RoleId,
    long GroupId);

public sealed record UpdateUserRequest(
    string Name,
    string Surname,
    string? AdditionalName,
    string? Email,
    string? Tel,
    long RoleId,
    long GroupId);
