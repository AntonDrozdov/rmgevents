namespace Application.Entities;

public sealed class User
{
    public Guid Id { get; set; }
    public Guid LoginId { get; set; }
    public Guid EventId { get; set; }
    public Guid RoleId { get; set; }
    public Guid GroupId { get; set; } // The group this user is assigned to
    public required string DisplayName { get; set; }
    public string? Meta { get; set; } // JSON metadata if needed
    public DateTimeOffset CreatedAt { get; set; }
    
    // Navigation properties
    public Login? Login { get; set; }
    public Event? Event { get; set; }
    public Role? Role { get; set; }
    public Group? Group { get; set; }
    public ICollection<Guest> CreatedGuests { get; set; } = [];
    public ICollection<Event> OwnedEvents { get; set; } = [];
}
