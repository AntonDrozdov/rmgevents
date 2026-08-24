namespace Api.Contracts;

public sealed record GroupDto(
    Guid Id,
    Guid EventId,
    Guid? ParentGroupId,
    string Name,
    int Quota,
    int UsedQuota,
    int AvailableQuota,
    List<GroupDto> Children,
    DateTimeOffset CreatedAt);

public sealed record CreateGroupRequest(
    string Name,
    int Quota,
    Guid? ParentGroupId);

public sealed record UpdateGroupRequest(
    string Name,
    int Quota);

public sealed record GroupTreeDto(
    Guid Id,
    string Name,
    int Quota,
    int UsedQuota,
    int AvailableQuota,
    List<GroupTreeDto> Children);
