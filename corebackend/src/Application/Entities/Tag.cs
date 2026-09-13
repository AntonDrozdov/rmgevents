namespace Application.Entities;

public sealed class Tag
{
    public long Id { get; set; }
    public long EventId { get; set; }
    public required string Name { get; set; }
    public required string Color { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public Event? Event { get; set; }
    public ICollection<GuestTag> GuestTags { get; set; } = [];
}
