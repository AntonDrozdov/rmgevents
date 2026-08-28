namespace Application.Entities;

public sealed class RolePermission
{
    public long RoleId { get; set; }
    public long PermissionId { get; set; }
    
    // Navigation properties
    public Role? Role { get; set; }
    public Permission? Permission { get; set; }
}
