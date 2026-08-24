using Microsoft.AspNetCore.Authorization;

namespace Infrastructure.Authorization;

public class PermissionRequirement : IAuthorizationRequirement
{
    public string Permission { get; set; }
    public bool RequiresGroup { get; set; }
    
    public PermissionRequirement(string permission, bool requiresGroup = false)
    {
        Permission = permission;
        RequiresGroup = requiresGroup;
    }
}
