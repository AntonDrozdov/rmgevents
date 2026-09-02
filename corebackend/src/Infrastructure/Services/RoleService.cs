using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed class RoleService(
    IRoleRepository roleRepository,
    IPermissionRepository permissionRepository) : IRoleService
{
    public async Task<Application.Entities.Role> CreateRoleAsync(
        long eventId,
        string name,
        List<string> permissionCodes)
    {
        var role = new Application.Entities.Role
        {
            Id = 0,
            EventId = eventId,
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
        return await roleRepository.GetByEventIdAsync(eventId);
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
    
    public async Task SeedDefaultRolesAsync(long eventId)
    {
        var permissions = await permissionRepository.GetAllAsync();
        
        // Administrator - all permissions
        var adminRole = await CreateRoleAsync(
            eventId,
            "Administrator",
            permissions.Select(p => p.Code).ToList());
        
        // Manager - create_guest, create_group, approve_guest
        var managerPermissions = new[] { "create_guest", "create_group", "approve_guest" };
        await CreateRoleAsync(
            eventId,
            "Manager",
            permissions.Where(p => managerPermissions.Contains(p.Code)).Select(p => p.Code).ToList());
        
        // Creator - create_guest
        await CreateRoleAsync(
            eventId,
            "Creator",
            new List<string> { "create_guest" });
    }
}
