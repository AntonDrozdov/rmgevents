namespace Application.Services;

public interface IGuestService
{
    Task<Entities.Guest> CreateGuestAsync(long eventId, long userId, string name, string? email, string? phone, long groupId);
    Task<Entities.Guest?> GetGuestAsync(long guestId);
    Task<List<Entities.Guest>> GetGuestsByEventAsync(long eventId);
    Task<List<Entities.Guest>> GetGuestsByGroupAsync(long groupId);
    Task<List<Entities.Guest>> GetGuestsByStatusAsync(long eventId, string status);
    Task ApproveGuestAsync(long guestId, long approverUserId);
    Task RejectGuestAsync(long guestId);
    Task UpdateGuestAsync(long guestId, string name, string? email, string? phone);
    Task DeleteGuestAsync(long guestId);
}
