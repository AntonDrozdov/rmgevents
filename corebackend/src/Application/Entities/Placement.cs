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
    public int? CanvasX { get; set; }
    public int? CanvasY { get; set; }
    public int? CanvasWidth { get; set; }
    public int? CanvasHeight { get; set; }
    public Guid? RowBatchId { get; set; }
    public bool IsRow { get; set; }
}

public sealed class PlacementTemplate
{
    public long Id { get; set; }
    public string Name { get; set; } = "";
    public string Structure { get; set; } = "[]";
    public DateTimeOffset CreatedAt { get; set; }
}
