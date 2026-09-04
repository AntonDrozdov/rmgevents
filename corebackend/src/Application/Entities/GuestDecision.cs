namespace Application.Entities;

public sealed class GuestDecision
{
    public long Id { get; set; }
    public long GuestId { get; set; }
    public long? ActorUserId { get; set; }
    public required string ActorName { get; set; }
    public required string Action { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public Guest? Guest { get; set; }
    public User? ActorUser { get; set; }
}
