using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed class RoleService(
    IRoleRepository roleRepository,
    IPermissionRepository permissionRepository) : IRoleService
{
    public async Task<Application.Entities.Role> CreateRoleAsync(
        string name,
        List<string> permissionCodes)
    {
        var role = new Application.Entities.Role
        {
            Id = 0,
            Name = name,
            CreatedAt = DateTimeOffset.UtcNow
        };
        
        await roleRepository.AddAsync(role);
        
        // Add permissions to role
        foreach (var code in permissionCodes)
        {
            var permission = await permissionRepository.GetByCodeAsync(code);
            if (permission != null)
            {
                role.RolePermissions.Add(new Application.Entities.RolePermission
                {
                    RoleId = role.Id,
                    PermissionId = permission.Id
                });
            }
        }
        
        await roleRepository.SaveChangesAsync();
        
        return role;
    }
    
    public async Task<Application.Entities.Role?> GetRoleAsync(long roleId)
    {
        return await roleRepository.GetByIdAsync(roleId);
    }
    
    public async Task<List<Application.Entities.Role>> GetRolesByEventAsync(long eventId)
    {
        return await roleRepository.GetAllAsync();
    }
    
    public async Task UpdateRoleAsync(long roleId, string name, List<string> permissionCodes)
    {
        var role = await roleRepository.GetByIdAsync(roleId);
        if (role == null)
            throw new InvalidOperationException($"Role {roleId} not found");
        
        role.Name = name;
        role.RolePermissions.Clear();
        
        foreach (var code in permissionCodes)
        {
            var permission = await permissionRepository.GetByCodeAsync(code);
            if (permission != null)
            {
                role.RolePermissions.Add(new Application.Entities.RolePermission
                {
                    RoleId = role.Id,
                    PermissionId = permission.Id
                });
            }
        }
        
        await roleRepository.UpdateAsync(role);
        await roleRepository.SaveChangesAsync();
    }
    
    public async Task DeleteRoleAsync(long roleId)
    {
        await roleRepository.DeleteAsync(roleId);
        await roleRepository.SaveChangesAsync();
    }
}
