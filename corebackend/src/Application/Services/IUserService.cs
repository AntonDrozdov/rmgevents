namespace Application.Services;

public interface IUserService
{
    Task<Entities.User> CreateUserAsync(
        long eventId,
        string loginValue,
        string name,
        string surname,
        string? additionalName,
        string? email,
        string? tel,
        long roleId,
        long groupId);
    Task<Entities.User?> GetUserAsync(long userId);
    Task<Entities.User?> GetUserInEventAsync(long userId, long eventId);
    Task<Entities.User?> GetUserByLoginAndEventAsync(long loginId, long eventId);
    Task<List<Entities.User>> GetUsersByEventAsync(long eventId);
    Task<List<Entities.User>> SearchUsersForEventAsync(
        long eventId,
        string? login,
        string? surname,
        string? name,
        string? email);
    Task UpdateUserAsync(
        long userId,
        long eventId,
        string login,
        string name,
        string surname,
        string? additionalName,
        string? email,
        string? tel,
        long roleId,
        long groupId);
    Task AssignRoleAsync(long userId, long eventId, long roleId, long groupId);
    Task<string> ResetUserPasswordAsync(long userId, long eventId);
    Task DeleteUserAsync(long userId);
}
