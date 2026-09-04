using Application.Repositories;
using Application.Services;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using System.Security.Cryptography;
using System.Text;

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

        try
        {
            var login = await loginRepository.GetByLoginAsync(loginValue);
            if (login != null && await userRepository.GetByLoginAndEventAsync(login.Id, eventId) != null)
                throw new InvalidOperationException(
                    "Сотрудник с таким логином уже существует в этом мероприятии.");

            login ??= await authService.CreateTemporaryLoginAsync(loginValue);

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
        catch (DbUpdateException ex) when (
            ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new InvalidOperationException(
                "Сотрудник с таким логином уже существует в этом мероприятии.",
                ex);
        }
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

    public async Task<List<Application.Entities.User>> SearchUsersForEventAsync(
        long eventId,
        string? login,
        string? surname,
        string? name,
        string? email)
    {
        static string? Normalize(string? value)
        {
            var normalized = value?.Trim();
            return normalized is { Length: >= 2 } ? normalized : null;
        }

        return await userRepository.SearchForEventAsync(
            eventId,
            Normalize(login),
            Normalize(surname),
            Normalize(name),
            Normalize(email),
            10);
    }
    
    public async Task<List<Application.Entities.User>> GetUsersByEventAsync(long eventId)
    {
        return await userRepository.GetByEventIdAsync(eventId);
    }
    
    public async Task UpdateUserAsync(
        long userId,
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
            throw new InvalidOperationException("Логин обязателен.");

        var normalizedLogin = loginValue.Trim();
        if (normalizedLogin.Length > 255)
            throw new InvalidOperationException("Логин не должен превышать 255 символов.");

        var user = await userRepository.GetByIdAsync(userId);
        if (user == null)
            throw new InvalidOperationException("Сотрудник не найден.");

        if (user.EventId != eventId)
            throw new InvalidOperationException("Сотрудник не принадлежит этому мероприятию.");

        await ValidateRoleAndGroupAsync(eventId, roleId, groupId);

        var targetRole = await roleRepository.GetByIdAsync(roleId)
            ?? throw new InvalidOperationException("Выбранная роль не найдена.");
        var removesAdministratorRole =
            string.Equals(user.Role?.Name, "Administrator", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(targetRole.Name, "Administrator", StringComparison.OrdinalIgnoreCase);

        if (removesAdministratorRole)
        {
            var eventUsers = await userRepository.GetByEventIdAsync(eventId);
            var administratorCount = eventUsers.Count(item =>
                string.Equals(item.Role?.Name, "Administrator", StringComparison.OrdinalIgnoreCase));

            if (administratorCount <= 1)
                throw new InvalidOperationException(
                    "Нельзя изменить роль единственного сотрудника с ролью Administrator.");
        }

        var login = user.Login
            ?? await loginRepository.GetByIdAsync(user.LoginId)
            ?? throw new InvalidOperationException("Учётная запись сотрудника не найдена.");

        if (!string.Equals(login.LoginValue, normalizedLogin, StringComparison.Ordinal))
        {
            var existingLogin = await loginRepository.GetByLoginAsync(normalizedLogin);
            if (existingLogin != null && existingLogin.Id != login.Id)
                throw new InvalidOperationException("Указанный логин уже используется.");

            login.LoginValue = normalizedLogin;
            if (login.MustChangePassword)
                login.PasswordHash = HashPassword(normalizedLogin);
        }

        user.Name = name;
        user.Surname = surname;
        user.AdditionalName = additionalName;
        user.Email = email;
        user.Tel = tel;
        user.RoleId = roleId;
        user.GroupId = groupId;

        try
        {
            await userRepository.UpdateAsync(user);
            await userRepository.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (
            ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new InvalidOperationException("Указанный логин уже используется.", ex);
        }
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

    private static string HashPassword(string password)
    {
        var hashedBytes = SHA256.HashData(Encoding.UTF8.GetBytes(password));
        return Convert.ToBase64String(hashedBytes);
    }
}
