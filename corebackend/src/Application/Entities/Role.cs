namespace Application.Entities;

public sealed class Role
{
    public long Id { get; set; }
    public required string Name { get; set; } // e.g., "Administrator", "Manager"
    public DateTimeOffset CreatedAt { get; set; }
    
    // Navigation properties
    public ICollection<RolePermission> RolePermissions { get; set; } = [];
    public ICollection<User> Users { get; set; } = [];
}
