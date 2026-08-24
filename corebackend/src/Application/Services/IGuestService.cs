namespace Application.Services;

public interface IGuestService
{
    Task<Entities.Guest> CreateGuestAsync(Guid eventId, Guid userId, string name, string? email, string? phone, Guid groupId);
    Task<Entities.Guest?> GetGuestAsync(Guid guestId);
    Task<List<Entities.Guest>> GetGuestsByEventAsync(Guid eventId);
    Task<List<Entities.Guest>> GetGuestsByGroupAsync(Guid groupId);
    Task<List<Entities.Guest>> GetGuestsByStatusAsync(Guid eventId, string status);
    Task ApproveGuestAsync(Guid guestId, Guid approverUserId);
    Task RejectGuestAsync(Guid guestId);
    Task UpdateGuestAsync(Guid guestId, string name, string? email, string? phone);
    Task DeleteGuestAsync(Guid guestId);
}
