namespace Application.Entities;

public sealed class OrganizationDepartment
{
    public long Id { get; set; }
    public long? ParentId { get; set; }
    public required string Name { get; set; }
    public required string NormalizedName { get; set; }
    public string? SourceParentName { get; set; }
    public int? SourceRowNumber { get; set; }
    public bool IsGeneratedFromParentName { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public OrganizationDepartment? Parent { get; set; }
    public ICollection<OrganizationDepartment> Children { get; set; } = [];
    public ICollection<OrganizationEmployee> Employees { get; set; } = [];
}
