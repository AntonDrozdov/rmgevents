namespace Application.Services;

public interface IAuthService
{
    Task<(long LoginId, string Sid)?> LoginAsync(string login, string password);
    Task<List<(long EventId, string EventName, string RoleName)>> GetAvailableEventsAsync(long loginId);
    Task<long?> RegisterUserAsync(string login, string password);
}
