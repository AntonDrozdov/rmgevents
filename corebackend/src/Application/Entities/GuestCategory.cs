namespace Application.Entities;

public sealed class GuestCategory
{
    public long GuestId { get; set; }
    public long CategoryId { get; set; }

    public Guest? Guest { get; set; }
    public Category? Category { get; set; }
}
