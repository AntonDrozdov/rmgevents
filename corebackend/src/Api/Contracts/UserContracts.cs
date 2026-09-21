namespace Api.Contracts;

public sealed record UserDto(
    long Id,
    long EventId,
    string Login,
    long RoleId,
    string? RoleName,
    long GroupId,
    string? GroupName,
    long? OrganizationEmployeeId,
    string? Position,
    string? DepartmentName,
    string Name,
    string Surname,
    string? AdditionalName,
    string? Email,
    string? Tel,
    string? CreatedByName,
    string? CreatedByRoleName,
    DateTimeOffset CreatedAt);

public sealed record UserSearchResultDto(
    long Id,
    string Login,
    string Name,
    string Surname,
    string? AdditionalName,
    string? Email,
    string? Tel,
    string? EventName,
    string? RoleName,
    string? GroupName);

public sealed record CreateUserRequest(
    string Login,
    string Name,
    string Surname,
    string? AdditionalName,
    string? Email,
    string? Tel,
    long RoleId,
    long GroupId,
    long? OrganizationEmployeeId);

public sealed record UpdateUserRequest(
    string Login,
    string Name,
    string Surname,
    string? AdditionalName,
    string? Email,
    string? Tel,
    long RoleId,
    long GroupId);

public sealed record ResetPasswordResponse(string TemporaryPassword);
