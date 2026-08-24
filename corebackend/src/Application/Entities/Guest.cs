namespace Application.Entities;

public sealed class Guest
{
    public Guid Id { get; set; }
    public Guid EventId { get; set; }
    public Guid GroupId { get; set; }
    public Guid CreatedByUserId { get; set; }
    public required string Name { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string Status { get; set; } = "pending"; // pending, approved, rejected
    public string? Meta { get; set; } // JSON metadata
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    
    // Navigation properties
    public Event? Event { get; set; }
    public Group? Group { get; set; }
    public User? CreatedByUser { get; set; }
}
