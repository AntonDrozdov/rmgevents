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
    int Quota);

public sealed record GroupTreeDto(
    long Id,
    string Name,
    int Quota,
    int UsedQuota,
    int AvailableQuota,
    List<GroupTreeDto> Children);
