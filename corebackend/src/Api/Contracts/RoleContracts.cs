namespace Api.Contracts;

public sealed record PermissionDto(
    Guid Id,
    string Code,
    string Description);

public sealed record RoleDto(
    Guid Id,
    Guid EventId,
    string Name,
    List<PermissionDto> Permissions,
    DateTimeOffset CreatedAt);

public sealed record CreateRoleRequest(
    string Name,
    List<string> PermissionCodes);

public sealed record UpdateRoleRequest(
    string Name,
    List<string> PermissionCodes);
