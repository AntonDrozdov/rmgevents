namespace Api.Contracts;

public sealed record GuestDto(
    long Id,
    long EventId,
    long GroupId,
    string? GroupName,
    string Name,
    string? Email,
    string? Phone,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ApprovedAt,
    List<GuestDecisionDto> Decisions);

public sealed record GuestDecisionDto(
    long Id,
    long? ActorUserId,
    string Action,
    string ActorName,
    DateTimeOffset CreatedAt);

public sealed record CreateGuestRequest(
    string Name,
    string? Email,
    string? Phone,
    long GroupId);

public sealed record ApproveGuestRequest(
    long GuestId,
    bool Approve);

public sealed record UpdateGuestRequest(
    string Name,
    string? Email,
    string? Phone,
    long GroupId);
