namespace Application.Entities;

public sealed class Guest
{
    public long Id { get; set; }
    public Guid PublicId { get; set; } = Guid.NewGuid();
    public long EventId { get; set; }
    public long GroupId { get; set; }
    public long? PlacementId { get; set; }
    public int? PlacementSeatNumber { get; set; }
    public long CreatedByUserId { get; set; }
    public required string Name { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string Status { get; set; } = "saved";
    public string? Meta { get; set; } // JSON metadata
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    
    // Navigation properties
    public Event? Event { get; set; }
    public Group? Group { get; set; }
    public User? CreatedByUser { get; set; }
    public GuestCategory? GuestCategory { get; set; }
    public ICollection<GuestTag> GuestTags { get; set; } = [];
    public ICollection<GuestDecision> Decisions { get; set; } = [];
}
