namespace Application.Services;

public interface IRoleService
{
    Task<Entities.Role> CreateRoleAsync(Guid eventId, string name, List<string> permissionCodes);
    Task<Entities.Role?> GetRoleAsync(Guid roleId);
    Task<List<Entities.Role>> GetRolesByEventAsync(Guid eventId);
    Task UpdateRoleAsync(Guid roleId, string name, List<string> permissionCodes);
    Task DeleteRoleAsync(Guid roleId);
    Task SeedDefaultRolesAsync(Guid eventId);
}
