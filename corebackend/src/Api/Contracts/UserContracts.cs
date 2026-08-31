namespace Api.Contracts;

public sealed record UserDto(
    long Id,
    long EventId,
    string Login,
    long RoleId,
    string? RoleName,
    long GroupId,
    string? GroupName,
    string Name,
    string Surname,
    string? AdditionalName,
    string? Email,
    string? Tel,
    DateTimeOffset CreatedAt);

public sealed record CreateUserRequest(
    string Login,
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

public sealed record ResetPasswordResponse(string TemporaryPassword);
