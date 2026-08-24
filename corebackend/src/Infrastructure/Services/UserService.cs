using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed class UserService(
    IUserRepository userRepository,
    ILoginRepository loginRepository) : IUserService
{
    public async Task<Application.Entities.User> CreateUserAsync(
        Guid eventId,
        Guid loginId,
        string displayName,
        Guid roleId,
        Guid groupId)
    {
        var login = await loginRepository.GetByIdAsync(loginId);
        if (login == null)
            throw new InvalidOperationException($"Login {loginId} not found");
        
        var user = new Application.Entities.User
        {
            Id = Guid.NewGuid(),
            LoginId = loginId,
            EventId = eventId,
            RoleId = roleId,
            GroupId = groupId,
            DisplayName = displayName,
            CreatedAt = DateTimeOffset.UtcNow
        };
        
        await userRepository.AddAsync(user);
        await userRepository.SaveChangesAsync();
        
        return user;
    }
    
    public async Task<Application.Entities.User?> GetUserAsync(Guid userId)
    {
        return await userRepository.GetByIdAsync(userId);
    }
    
    public async Task<Application.Entities.User?> GetUserInEventAsync(Guid userId, Guid eventId)
    {
        var user = await userRepository.GetByIdAsync(userId);
        if (user?.EventId != eventId)
            return null;
        return user;
    }
    
    public async Task<List<Application.Entities.User>> GetUsersByEventAsync(Guid eventId)
    {
        return await userRepository.GetByEventIdAsync(eventId);
    }
    
    public async Task UpdateUserAsync(Guid userId, string displayName)
    {
        var user = await userRepository.GetByIdAsync(userId);
        if (user == null)
            throw new InvalidOperationException($"User {userId} not found");
        
        user.DisplayName = displayName;
        
        await userRepository.UpdateAsync(user);
        await userRepository.SaveChangesAsync();
    }
    
    public async Task AssignRoleAsync(Guid userId, Guid eventId, Guid roleId, Guid groupId)
    {
        var user = await userRepository.GetByIdAsync(userId);
        if (user == null)
            throw new InvalidOperationException($"User {userId} not found");
        
        if (user.EventId != eventId)
            throw new InvalidOperationException("User is not part of this event");
        
        user.RoleId = roleId;
        user.GroupId = groupId;
        
        await userRepository.UpdateAsync(user);
        await userRepository.SaveChangesAsync();
    }
    
    public async Task DeleteUserAsync(Guid userId)
    {
        await userRepository.DeleteAsync(userId);
        await userRepository.SaveChangesAsync();
    }
}
