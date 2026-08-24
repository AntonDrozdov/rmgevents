namespace Application.Services;

public interface IUserService
{
    Task<Entities.User> CreateUserAsync(Guid eventId, Guid loginId, string displayName, Guid roleId, Guid groupId);
    Task<Entities.User?> GetUserAsync(Guid userId);
    Task<Entities.User?> GetUserInEventAsync(Guid userId, Guid eventId);
    Task<List<Entities.User>> GetUsersByEventAsync(Guid eventId);
    Task UpdateUserAsync(Guid userId, string displayName);
    Task AssignRoleAsync(Guid userId, Guid eventId, Guid roleId, Guid groupId);
    Task DeleteUserAsync(Guid userId);
}
