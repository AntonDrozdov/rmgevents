namespace Application.Entities;

public sealed class TicketTemplate
{
    public long Id { get; set; }
    public long EventId { get; set; }
    public string Name { get; set; } = string.Empty;
    public long BackgroundImageId { get; set; }
    public int QrX { get; set; }
    public int QrY { get; set; }
    public int QrSize { get; set; }
    public int QrRadius { get; set; }
    public bool IsDefault { get; set; }
    public Event? Event { get; set; }
    public ImageEntity? BackgroundImage { get; set; }
}
