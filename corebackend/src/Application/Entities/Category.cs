namespace Application.Entities;

public sealed class Category
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public required string Description { get; set; }
    public Guid ImageId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public ICollection<Product> Products { get; set; } = new List<Product>();
}
