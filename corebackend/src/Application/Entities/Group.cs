namespace Application.Entities;

public sealed class Group
{
    public Guid Id { get; set; }
    public Guid EventId { get; set; }
    public Guid? ParentGroupId { get; set; } // Self-referencing for hierarchy
    public required string Name { get; set; }
    public int Quota { get; set; } // Maximum capacity
    public DateTimeOffset CreatedAt { get; set; }
    
    // Navigation properties
    public Event? Event { get; set; }
    public Group? ParentGroup { get; set; }
    public ICollection<Group> ChildGroups { get; set; } = [];
    public ICollection<User> Users { get; set; } = [];
    public ICollection<Guest> Guests { get; set; } = [];
}
