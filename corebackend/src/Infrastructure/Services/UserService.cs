using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed class UserService(
    IUserRepository userRepository,
    ILoginRepository loginRepository,
    IAuthService authService,
    IRoleRepository roleRepository,
    IGroupRepository groupRepository) : IUserService
{
    public async Task<Application.Entities.User> CreateUserAsync(
        long eventId,
        string loginValue,
        string name,
        string surname,
        string? additionalName,
        string? email,
        string? tel,
        long roleId,
        long groupId)
    {
        if (string.IsNullOrWhiteSpace(loginValue))
            throw new InvalidOperationException("Login is required");

        await ValidateRoleAndGroupAsync(eventId, roleId, groupId);

        var login = await loginRepository.GetByLoginAsync(loginValue)
            ?? await authService.CreateTemporaryLoginAsync(loginValue);
        
        var user = new Application.Entities.User
        {
            Id = 0,
            LoginId = login.Id,
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
        
        return await userRepository.GetByIdAsync(user.Id) ?? user;
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

        await ValidateRoleAndGroupAsync(eventId, roleId, groupId);
        
        user.RoleId = roleId;
        user.GroupId = groupId;
        
        await userRepository.UpdateAsync(user);
        await userRepository.SaveChangesAsync();
    }
    
    public async Task DeleteUserAsync(long userId)
    {
        var user = await userRepository.GetByIdAsync(userId);
        if (user == null)
            return;

        if (string.Equals(user.Role?.Name, "Administrator", StringComparison.OrdinalIgnoreCase))
        {
            var eventUsers = await userRepository.GetByEventIdAsync(user.EventId);
            var administratorCount = eventUsers.Count(item =>
                string.Equals(item.Role?.Name, "Administrator", StringComparison.OrdinalIgnoreCase));

            if (administratorCount <= 1)
                throw new InvalidOperationException(
                    "Нельзя удалить единственного сотрудника с ролью Administrator.");
        }

        await userRepository.DeleteAsync(userId);
        await userRepository.SaveChangesAsync();
    }

    public async Task<string> ResetUserPasswordAsync(long userId, long eventId)
    {
        var user = await userRepository.GetByIdAsync(userId);
        if (user == null || user.EventId != eventId)
            throw new InvalidOperationException($"User {userId} not found");

        await authService.ResetPasswordAsync(user.LoginId);
        return user.Login?.LoginValue
            ?? throw new InvalidOperationException($"Login {user.LoginId} not found");
    }

    private async Task ValidateRoleAndGroupAsync(long eventId, long roleId, long groupId)
    {
        var role = await roleRepository.GetByIdAsync(roleId);
        if (role == null || role.EventId != eventId)
            throw new InvalidOperationException("Выбранная роль не принадлежит мероприятию.");

        var group = await groupRepository.GetByIdAsync(groupId);
        if (group == null || group.EventId != eventId)
            throw new InvalidOperationException("Выбранная группа не принадлежит мероприятию.");

        if (!string.Equals(role.Name, "Administrator", StringComparison.OrdinalIgnoreCase))
            return;

        var rootGroups = await groupRepository.GetRootGroupsByEventAsync(eventId);
        if (rootGroups.Count != 1)
            throw new InvalidOperationException("У мероприятия должна быть одна корневая группа.");

        if (group.Id != rootGroups[0].Id)
            throw new InvalidOperationException(
                "Сотрудник с ролью Administrator должен состоять в корневой группе.");
    }
}
