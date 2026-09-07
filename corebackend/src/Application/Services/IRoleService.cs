namespace Application.Services;

public interface IRoleService
{
    Task<Entities.Role> CreateRoleAsync(string name, List<string> permissionCodes);
    Task<Entities.Role?> GetRoleAsync(long roleId);
    Task<List<Entities.Role>> GetRolesByEventAsync(long eventId);
    Task UpdateRoleAsync(long roleId, string name, List<string> permissionCodes);
    Task DeleteRoleAsync(long roleId);
}
