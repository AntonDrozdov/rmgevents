namespace Application.Services;

public interface IGuestService
{
    Task<Entities.Guest> CreateGuestAsync(long eventId, long loginId, string name, string? email, string? phone, long groupId, long? categoryId, IReadOnlyCollection<long> tagIds, long? placementId = null, int? placementSeatNumber = null);
    Task<Entities.Guest?> GetGuestAsync(long guestId, bool includeDeleted = false);
    Task<Entities.Guest?> GetGuestByPublicIdAsync(Guid publicId);
    Task<List<Entities.Guest>> GetGuestsByEventAsync(long eventId);
    Task<(List<Entities.Guest> Items, int TotalCount, int Page, int PageSize)> GetGuestsPageByEventAsync(
        long eventId,
        int page,
        int pageSize,
        string? search,
        IReadOnlyCollection<string>? statuses = null,
        bool eligibleForSeating = false,
        IReadOnlyCollection<long>? categoryIds = null,
        IReadOnlyCollection<long>? tagIds = null,
        IReadOnlyCollection<long>? groupIds = null,
        IReadOnlyCollection<long>? createdByUserIds = null,
        bool includeDeleted = false,
        string? sortBy = null,
        string? sortDirection = null);
    Task<List<Entities.Guest>> GetGuestsByGroupAsync(long groupId);
    Task<List<Entities.Guest>> GetGuestsByStatusAsync(long eventId, string status);
    Task<List<Entities.Guest>> SearchGuestsForEventAsync(
        long eventId,
        string? name,
        string? email,
        string? phone);
    Task SubmitGuestForReviewAsync(long guestId, long loginId);
    Task ApproveGuestAsync(long guestId, long approverLoginId);
    Task RejectGuestAsync(long guestId, long approverLoginId);
    Task InviteGuestAsync(long guestId, long inviterLoginId);
    Task RestoreGuestToSavedAsync(long guestId, long loginId);
    Task UpdateGuestAsync(long guestId, long loginId, string name, string? email, string? phone, long groupId, long? categoryId, IReadOnlyCollection<long> tagIds, long? placementId = null, int? placementSeatNumber = null);
    Task DeleteGuestAsync(long guestId, long loginId);
    Task RestoreDeletedGuestAsync(long guestId, long loginId);
    Task<GuestBulkSummary> GetBulkSummaryAsync(long eventId, long loginId, Repositories.GuestSelection selection);
    Task<GuestBulkActionResult> ExecuteBulkActionAsync(long eventId, long loginId, string action, Repositories.GuestSelection selection);
}
