using System.ComponentModel.DataAnnotations;

namespace Api.Contracts;

public sealed record GuestDto(
    long Id,
    Guid PublicId,
    long EventId,
    long GroupId,
    string? GroupName,
    long? CategoryId,
    string? CategoryName,
    string? CategoryColor,
    List<GuestTagDto> Tags,
    string Name,
    string? Email,
    string? Phone,
    string Status,
    long CreatedByUserId,
    string? CreatedByName,
    string? CreatedByRoleName,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ApprovedAt,
    List<GuestDecisionDto> Decisions,
    long? PlacementId,
    int? PlacementSeatNumber,
    bool IsDeleted,
    DateTimeOffset? DeletedAt,
    long? DeletedByUserId,
    string? DeletedByName);

public sealed record PublicGuestDto(
    string Name,
    string? Email,
    string? Phone,
    string? GroupName,
    string? CategoryName,
    string? CategoryColor,
    List<GuestTagDto> Tags,
    string Status,
    DateTimeOffset CreatedAt);

public sealed record PagedResultDto<T>(
    List<T> Items,
    int TotalCount,
    int Page,
    int PageSize);

public sealed record GuestSearchResultDto(
    long Id,
    string Name,
    string? Email,
    string? Phone,
    string? EventName,
    string? GroupName,
    string Status,
    DateTimeOffset CreatedAt);

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
    long GroupId,
    [Required] long? CategoryId,
    List<long>? TagIds,
    long? PlacementId = null,
    int? PlacementSeatNumber = null);

public sealed record ApproveGuestRequest(
    long GuestId,
    bool Approve);

public sealed record UpdateGuestRequest(
    string Name,
    string? Email,
    string? Phone,
    long GroupId,
    [Required] long? CategoryId,
    List<long>? TagIds,
    long? PlacementId = null,
    int? PlacementSeatNumber = null);

public sealed record GuestBulkSelectionRequest(
    bool SelectAllMatching,
    List<long>? GuestIds,
    List<long>? ExcludedGuestIds,
    string? Search,
    List<string>? Statuses,
    bool IncludeDeleted,
    List<long>? CategoryIds,
    List<long>? TagIds,
    List<long>? GroupIds,
    List<long>? CreatedByUserIds);

public sealed record GuestBulkActionRequest(string Action, GuestBulkSelectionRequest Selection);
public sealed record GuestBulkActionOptionDto(string Action, string Label, int EligibleCount);
public sealed record GuestBulkSummaryDto(int SelectedCount, List<GuestBulkActionOptionDto> Actions);
public sealed record GuestBulkSkipReasonDto(string Reason, int Count);
public sealed record GuestBulkActionResultDto(int SelectedCount, int ChangedCount, int SkippedCount, List<GuestBulkSkipReasonDto> Reasons);
