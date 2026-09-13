namespace Application.Entities;

public sealed class OrganizationEmployee
{
    public long Id { get; set; }
    public long DepartmentId { get; set; }
    public required string FullName { get; set; }
    public string? Surname { get; set; }
    public string? Name { get; set; }
    public string? AdditionalName { get; set; }
    public required string Position { get; set; }
    public int SourceRowNumber { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public OrganizationDepartment? Department { get; set; }
}
