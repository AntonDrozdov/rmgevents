namespace Application.Services;

public interface IGuestService
{
    Task<Entities.Guest> CreateGuestAsync(long eventId, long userId, string name, string? email, string? phone, long groupId);
    Task<Entities.Guest?> GetGuestAsync(long guestId);
    Task<List<Entities.Guest>> GetGuestsByEventAsync(long eventId);
    Task<List<Entities.Guest>> GetGuestsByGroupAsync(long groupId);
    Task<List<Entities.Guest>> GetGuestsByStatusAsync(long eventId, string status);
    Task SubmitGuestForReviewAsync(long guestId, long userId);
    Task ApproveGuestAsync(long guestId, long approverUserId);
    Task RejectGuestAsync(long guestId, long approverUserId);
    Task InviteGuestAsync(long guestId, long inviterUserId);
    Task RestoreGuestToSavedAsync(long guestId, long userId);
    Task UpdateGuestAsync(long guestId, long userId, string name, string? email, string? phone, long groupId);
    Task DeleteGuestAsync(long guestId, long userId);
}
