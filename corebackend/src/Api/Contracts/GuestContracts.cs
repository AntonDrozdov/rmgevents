namespace Api.Contracts;

public sealed record GuestDto(
    Guid Id,
    Guid EventId,
    Guid GroupId,
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
    Guid GroupId);

public sealed record ApproveGuestRequest(
    Guid GuestId,
    bool Approve);
