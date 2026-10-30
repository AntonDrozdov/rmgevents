namespace Application.Entities;

public sealed class PlacementEditLock
{
    public long EventId { get; set; }
    public long UserId { get; set; }
    public Guid Token { get; set; }
    public DateTimeOffset AcquiredAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
}
