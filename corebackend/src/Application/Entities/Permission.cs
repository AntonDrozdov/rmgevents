namespace Application.Entities;

public sealed class Permission
{
    public long Id { get; set; }
    public required string Code { get; set; } // e.g., "create_guest", "create_event"
    public required string Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    
    // Navigation properties
    public ICollection<RolePermission> RolePermissions { get; set; } = [];
}
