namespace Application.Entities;

public sealed class EventLog
{
    public long Id { get; set; }
    public long EventId { get; set; }
    public long? UserId { get; set; }
    public required string ActorName { get; set; }
    public string? ActorRoleName { get; set; }
    public required string Action { get; set; }
    public required string EntityType { get; set; }
    public long? EntityId { get; set; }
    public required string Title { get; set; }
    public string? Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public Event? Event { get; set; }
    public User? User { get; set; }
}
