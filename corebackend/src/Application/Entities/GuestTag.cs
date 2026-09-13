namespace Application.Entities;

public sealed class GuestTag
{
    public long GuestId { get; set; }
    public long TagId { get; set; }

    public Guest? Guest { get; set; }
    public Tag? Tag { get; set; }
}
