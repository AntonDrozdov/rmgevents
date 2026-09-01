namespace Application.Services;

public interface IAuthService
{
    Task<(long LoginId, string Sid, bool MustChangePassword)?> LoginAsync(string login, string password);
    Task<List<(long EventId, string EventName, string RoleName, DateOnly EventDate, DateTimeOffset CreatedAt, string CreatedByName, long? LogoImageId)>> GetAvailableEventsAsync(long loginId);
    Task<long?> RegisterUserAsync(string login, string password);
    Task<Entities.Login> CreateTemporaryLoginAsync(string login);
    Task ResetPasswordAsync(long loginId);
    Task<string?> ChangePasswordAsync(long loginId, string currentPassword, string newPassword);
}
