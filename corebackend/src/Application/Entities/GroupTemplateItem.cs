namespace Application.Entities;

public sealed class GroupTemplateItem
{
    public long Id { get; set; }
    public long TemplateId { get; set; }
    public long? ParentItemId { get; set; }
    public required string Name { get; set; }
    public int Quota { get; set; }
    public int SortOrder { get; set; }

    public GroupTemplate? Template { get; set; }
    public GroupTemplateItem? ParentItem { get; set; }
    public ICollection<GroupTemplateItem> ChildItems { get; set; } = [];
}
