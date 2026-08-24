namespace Application.Services;

public interface IAuthService
{
    Task<(Guid LoginId, string Token)?> LoginAsync(string username, string password);
    Task<List<(Guid EventId, string EventName, string RoleName)>> GetAvailableEventsAsync(Guid loginId);
    Task<Guid?> RegisterUserAsync(string username, string password, string displayName);
}
