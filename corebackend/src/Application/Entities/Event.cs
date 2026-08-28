namespace Application.Entities;

public sealed class Event
{
    public long Id { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public long? LogoImageId { get; set; }
    public long OwnerId { get; set; } // FK to User
    public DateTimeOffset CreatedAt { get; set; }
    public bool IsArchived { get; set; } = false;
    
    // Navigation properties
    public ImageEntity? LogoImage { get; set; }
    public User? Owner { get; set; }
    public ICollection<Role> Roles { get; set; } = [];
    public ICollection<Group> Groups { get; set; } = [];
    public ICollection<User> Users { get; set; } = [];
    public ICollection<Guest> Guests { get; set; } = [];
}
