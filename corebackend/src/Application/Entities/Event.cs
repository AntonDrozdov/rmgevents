namespace Application.Entities;

public sealed class Event
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public Guid? LogoImageId { get; set; }
    public Guid OwnerId { get; set; } // FK to User
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
