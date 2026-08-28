using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed class UserService(
    IUserRepository userRepository,
    ILoginRepository loginRepository) : IUserService
{
    public async Task<Application.Entities.User> CreateUserAsync(
        long eventId,
        long loginId,
        string name,
        string surname,
        string? additionalName,
        string? email,
        string? tel,
        long roleId,
        long groupId)
    {
        var login = await loginRepository.GetByIdAsync(loginId);
        if (login == null)
            throw new InvalidOperationException($"Login {loginId} not found");
        
        var user = new Application.Entities.User
        {
            Id = 0,
            LoginId = loginId,
            EventId = eventId,
            RoleId = roleId,
            GroupId = groupId,
            Name = name,
            Surname = surname,
            AdditionalName = additionalName,
            Email = email,
            Tel = tel,
            CreatedAt = DateTimeOffset.UtcNow
        };
        
        await userRepository.AddAsync(user);
        await userRepository.SaveChangesAsync();
        
        return user;
    }
    
    public async Task<Application.Entities.User?> GetUserAsync(long userId)
    {
        return await userRepository.GetByIdAsync(userId);
    }
    
    public async Task<Application.Entities.User?> GetUserInEventAsync(long userId, long eventId)
    {
        var user = await userRepository.GetByIdAsync(userId);
        if (user?.EventId != eventId)
            return null;
        return user;
    }

    public async Task<Application.Entities.User?> GetUserByLoginAndEventAsync(long loginId, long eventId)
    {
        return await userRepository.GetByLoginAndEventAsync(loginId, eventId);
    }
    
    public async Task<List<Application.Entities.User>> GetUsersByEventAsync(long eventId)
    {
        return await userRepository.GetByEventIdAsync(eventId);
    }
    
    public async Task UpdateUserAsync(
        long userId,
        string name,
        string surname,
        string? additionalName,
        string? email,
        string? tel)
    {
        var user = await userRepository.GetByIdAsync(userId);
        if (user == null)
            throw new InvalidOperationException($"User {userId} not found");
        
        user.Name = name;
        user.Surname = surname;
        user.AdditionalName = additionalName;
        user.Email = email;
        user.Tel = tel;
        
        await userRepository.UpdateAsync(user);
        await userRepository.SaveChangesAsync();
    }
    
    public async Task AssignRoleAsync(long userId, long eventId, long roleId, long groupId)
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
    
    public async Task DeleteUserAsync(long userId)
    {
        await userRepository.DeleteAsync(userId);
        await userRepository.SaveChangesAsync();
    }
}
