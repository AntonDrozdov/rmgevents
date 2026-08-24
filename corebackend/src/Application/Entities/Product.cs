namespace Application.Entities;

public sealed class Product
{
    public Guid Id { get; set; }
    public Guid CategoryId { get; set; }
    public required string Name { get; set; }
    public required string Description { get; set; }
    public Guid ImageId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
