namespace Application.Entities;

public sealed class ImageEntity
{
    public Guid Id { get; set; }
    public required string FileName { get; set; }
    public required string ContentType { get; set; }
    public required byte[] Data { get; set; }
    public string? AltText { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
