namespace Application.Services;

public sealed record GroupTemplateSummary(
    long Id,
    string Name,
    string? Description,
    int GroupsCount,
    string CreatedByLogin,
    DateTimeOffset CreatedAt);

public sealed record GroupTemplateApplyResult(
    long TemplateId,
    string TemplateName,
    int GroupsDeleted,
    int GroupsCreated,
    long RootGroupId,
    int RootQuota,
    List<string> Warnings);

public interface IGroupTemplateService
{
    Task<List<GroupTemplateSummary>> GetTemplatesAsync(long eventId, long loginId, CancellationToken cancellationToken = default);

    Task<GroupTemplateSummary> SaveFromEventAsync(
        long eventId,
        long loginId,
        string name,
        string? description,
        CancellationToken cancellationToken = default);

    Task<GroupTemplateApplyResult> ApplyToEventAsync(
        long eventId,
        long loginId,
        long templateId,
        CancellationToken cancellationToken = default);
}
