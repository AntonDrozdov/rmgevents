namespace Api.Contracts;

public sealed record GuestDto(
    long Id,
    long EventId,
    long GroupId,
    string Name,
    string? Email,
    string? Phone,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ApprovedAt);

public sealed record CreateGuestRequest(
    string Name,
    string? Email,
    string? Phone,
    long GroupId);

public sealed record ApproveGuestRequest(
    long GuestId,
    bool Approve);
