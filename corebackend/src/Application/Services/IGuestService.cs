namespace Application.Services;

public interface IGuestService
{
    Task<Entities.Guest> CreateGuestAsync(long eventId, long loginId, string name, string? email, string? phone, long groupId);
    Task<Entities.Guest?> GetGuestAsync(long guestId);
    Task<List<Entities.Guest>> GetGuestsByEventAsync(long eventId);
    Task<(List<Entities.Guest> Items, int TotalCount, int Page, int PageSize)> GetGuestsPageByEventAsync(
        long eventId,
        int page,
        int pageSize,
        string? search);
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
    Task UpdateGuestAsync(long guestId, long loginId, string name, string? email, string? phone, long groupId);
    Task DeleteGuestAsync(long guestId, long loginId);
}
