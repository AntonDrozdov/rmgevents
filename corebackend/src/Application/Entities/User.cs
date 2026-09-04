namespace Application.Entities;

public sealed class User
{
    public long Id { get; set; }
    public long LoginId { get; set; }
    public long EventId { get; set; }
    public long RoleId { get; set; }
    public long GroupId { get; set; } // The group this user is assigned to
    public required string Name { get; set; }
    public required string Surname { get; set; }
    public string? AdditionalName { get; set; }
    public string? Email { get; set; }
    public string? Tel { get; set; }
    public string? Meta { get; set; } // JSON metadata if needed
    public DateTimeOffset CreatedAt { get; set; }
    
    // Navigation properties
    public Login? Login { get; set; }
    public Event? Event { get; set; }
    public Role? Role { get; set; }
    public Group? Group { get; set; }
    public ICollection<Guest> CreatedGuests { get; set; } = [];
    public ICollection<GuestDecision> GuestDecisions { get; set; } = [];
    public ICollection<Event> OwnedEvents { get; set; } = [];
}
