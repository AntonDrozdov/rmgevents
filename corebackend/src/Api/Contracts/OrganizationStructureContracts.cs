namespace Api.Contracts;

public sealed record OrganizationImportResultDto(
    int DepartmentsCreated,
    int EmployeesCreated,
    int GeneratedParentsCreated,
    int RowsProcessed,
    List<string> Warnings);

public sealed record ApplyOriginalStructureResultDto(
    int GroupsCreated,
    int GroupsReused,
    int GroupsRenamed,
    int GroupsQuotaUpdated,
    int DepartmentsProcessed,
    List<string> Warnings);

public sealed record OrganizationEmployeeTreeItemDto(
    long Id,
    long DepartmentId,
    string FullName,
    string? Surname,
    string? Name,
    string? AdditionalName,
    string Position,
    int SourceRowNumber);

public sealed record OrganizationDepartmentTreeItemDto(
    long Id,
    long? ParentId,
    string Name,
    bool IsGeneratedFromParentName,
    List<OrganizationEmployeeTreeItemDto> Employees,
    List<OrganizationDepartmentTreeItemDto> Children);

public sealed record OrganizationStructureTreeDto(
    List<OrganizationDepartmentTreeItemDto> Departments,
    int DepartmentsCount,
    int EmployeesCount,
    DateTimeOffset? LoadedAt);
