namespace Application.Entities;

public sealed class Category
{
    public long Id { get; set; }
    public long EventId { get; set; }
    public required string Name { get; set; }
    public required string Color { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public Event? Event { get; set; }
    public ICollection<GuestCategory> GuestCategories { get; set; } = [];
}
