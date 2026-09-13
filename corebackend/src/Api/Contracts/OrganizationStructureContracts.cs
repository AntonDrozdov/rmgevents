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
