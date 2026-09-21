namespace Application.Services;

public sealed record OrganizationImportResult(
    int DepartmentsCreated,
    int EmployeesCreated,
    int GeneratedParentsCreated,
    int RowsProcessed,
    List<string> Warnings);

public sealed record ApplyOriginalStructureResult(
    int GroupsCreated,
    int GroupsReused,
    int GroupsRenamed,
    int GroupsQuotaUpdated,
    int DepartmentsProcessed,
    List<string> Warnings);

public sealed record OrganizationEmployeeTreeItem(
    long Id,
    long DepartmentId,
    string FullName,
    string? Surname,
    string? Name,
    string? AdditionalName,
    string Position,
    int SourceRowNumber);

public sealed record OrganizationDepartmentTreeItem(
    long Id,
    long? ParentId,
    string Name,
    bool IsGeneratedFromParentName,
    List<OrganizationEmployeeTreeItem> Employees,
    List<OrganizationDepartmentTreeItem> Children);

public sealed record OrganizationStructureTree(
    List<OrganizationDepartmentTreeItem> Departments,
    int DepartmentsCount,
    int EmployeesCount,
    DateTimeOffset? LoadedAt);

public interface IOrganizationStructureService
{
    Task<OrganizationImportResult> ImportRmgStructureAsync(
        long eventId,
        long loginId,
        string fileName,
        Stream file,
        CancellationToken cancellationToken = default);

    Task<ApplyOriginalStructureResult> ApplyOriginalStructureAsync(
        long eventId,
        long loginId,
        CancellationToken cancellationToken = default);

    Task<OrganizationStructureTree> GetTreeAsync(
        long eventId,
        long loginId,
        CancellationToken cancellationToken = default);
}
