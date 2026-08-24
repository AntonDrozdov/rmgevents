namespace Application.Entities;

public sealed class Role
{
    public Guid Id { get; set; }
    public Guid EventId { get; set; }
    public required string Name { get; set; } // e.g., "Administrator", "Manager"
    public DateTimeOffset CreatedAt { get; set; }
    
    // Navigation properties
    public Event? Event { get; set; }
    public ICollection<RolePermission> RolePermissions { get; set; } = [];
    public ICollection<User> Users { get; set; } = [];
}
