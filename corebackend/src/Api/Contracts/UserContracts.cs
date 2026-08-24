namespace Api.Contracts;

public sealed record UserDto(
    Guid Id,
    Guid LoginId,
    Guid EventId,
    Guid RoleId,
    Guid GroupId,
    string DisplayName,
    DateTimeOffset CreatedAt);

public sealed record CreateUserRequest(
    string Username,
    string DisplayName,
    Guid RoleId,
    Guid GroupId);

public sealed record UpdateUserRequest(
    string DisplayName,
    Guid RoleId,
    Guid GroupId);
