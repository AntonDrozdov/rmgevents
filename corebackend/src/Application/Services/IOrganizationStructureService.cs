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
}
