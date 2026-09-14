namespace Api.Contracts;

public sealed record GroupDto(
    long Id,
    long EventId,
    long? ParentGroupId,
    string Name,
    int Quota,
    int UsedQuota,
    int AvailableQuota,
    List<GroupDto> Children,
    DateTimeOffset CreatedAt);

public sealed record CreateGroupRequest(
    string Name,
    int Quota,
    long? ParentGroupId);

public sealed record UpdateGroupRequest(
    string Name,
    int Quota,
    long? ParentGroupId = null,
    bool MoveToParent = false);

public sealed record GroupTreeDto(
    long Id,
    string Name,
    int Quota,
    int UsedQuota,
    int AvailableQuota,
    List<GroupTreeDto> Children);

public sealed record ResetGroupsResultDto(
    int GroupsDeleted,
    int GuestsMoved,
    int UsersMoved,
    int RootQuota);

public sealed record GroupTemplateDto(
    long Id,
    string Name,
    string? Description,
    int GroupsCount,
    string CreatedByLogin,
    DateTimeOffset CreatedAt);

public sealed record CreateGroupTemplateRequest(
    string Name,
    string? Description);

public sealed record ApplyGroupTemplateRequest(
    long TemplateId);

public sealed record ApplyGroupTemplateResultDto(
    long TemplateId,
    string TemplateName,
    int GroupsDeleted,
    int GroupsCreated,
    long RootGroupId,
    int RootQuota,
    List<string> Warnings);
