namespace Application.Entities;

public sealed class Placement
{
    public long Id { get; set; }
    public long EventId { get; set; }
    public long? ParentId { get; set; }
    public long? GroupId { get; set; }
    public string Name { get; set; } = "";
    public int? Quota { get; set; }
    public bool DisplayChildrenAsRows { get; set; }
}

public sealed class PlacementTemplate
{
    public long Id { get; set; }
    public string Name { get; set; } = "";
    public string Structure { get; set; } = "[]";
    public DateTimeOffset CreatedAt { get; set; }
}
