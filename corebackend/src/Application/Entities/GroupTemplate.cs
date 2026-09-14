namespace Application.Entities;

public sealed class GroupTemplate
{
    public long Id { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public long CreatedByLoginId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public Login? CreatedByLogin { get; set; }
    public ICollection<GroupTemplateItem> Items { get; set; } = [];
}
