using Application.Repositories;
using Application.Services;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Extensions.Configuration;

namespace Infrastructure.Services;

public sealed class AuthService(
    ILoginRepository loginRepository,
    IUserRepository userRepository,
    IConfiguration configuration,
    ISidProtector sidProtector) : IAuthService
{
    public async Task<(long LoginId, string Sid, bool MustChangePassword)?> LoginAsync(string loginValue, string password)
    {
        var login = await loginRepository.GetByLoginAsync(loginValue);
        if (login == null || !VerifyPassword(password, login.PasswordHash))
            return null;
        
        return (
            login.Id,
            sidProtector.Protect(CreateToken(login.Id, login.LoginValue, login.MustChangePassword)),
            login.MustChangePassword);
    }
    
    public async Task<List<(
        long EventId,
        string EventName,
        string RoleName,
        DateOnly EventDate,
        DateTimeOffset CreatedAt,
        string CreatedByName,
        long? LogoImageId)>> GetAvailableEventsAsync(long loginId)
    {
        var users = await userRepository.GetByLoginIdAsync(loginId);
        var result = new List<(long, string, string, DateOnly, DateTimeOffset, string, long?)>();
        
        foreach (var user in users)
        {
            if (user.Event != null && user.Role != null)
            {
                var owner = user.Event.Owner;
                var createdByName = owner == null
                    ? "—"
                    : string.Join(" ", new[] { owner.Surname, owner.Name, owner.AdditionalName }
                        .Where(part => !string.IsNullOrWhiteSpace(part)));

                result.Add((
                    user.EventId,
                    user.Event.Name,
                    user.Role.Name,
                    user.Event.EventDate,
                    user.Event.CreatedAt,
                    createdByName,
                    user.Event.LogoImageId));
            }
        }
        
        return result;
    }
    
    public async Task<long?> RegisterUserAsync(string loginValue, string password)
    {
        var existingLogin = await loginRepository.GetByLoginAsync(loginValue);
        if (existingLogin != null)
            return null;
        
        var passwordHash = HashPassword(password);
        var login = new Application.Entities.Login
        {
            Id = 0,
            LoginValue = loginValue,
            PasswordHash = passwordHash,
            MustChangePassword = false,
            CreatedAt = DateTimeOffset.UtcNow
        };
        
        await loginRepository.AddAsync(login);
        await loginRepository.SaveChangesAsync();
        
        return login.Id;
    }

    public async Task<Application.Entities.Login> CreateTemporaryLoginAsync(string loginValue)
    {
        var login = new Application.Entities.Login
        {
            Id = 0,
            LoginValue = loginValue,
            PasswordHash = HashPassword(loginValue),
            MustChangePassword = true,
            CreatedAt = DateTimeOffset.UtcNow
        };

        await loginRepository.AddAsync(login);
        await loginRepository.SaveChangesAsync();
        return login;
    }

    public async Task ResetPasswordAsync(long loginId)
    {
        var login = await loginRepository.GetByIdAsync(loginId)
            ?? throw new InvalidOperationException($"Login {loginId} not found");

        login.PasswordHash = HashPassword(login.LoginValue);
        login.MustChangePassword = true;
        await loginRepository.SaveChangesAsync();
    }

    public async Task<string?> ChangePasswordAsync(
        long loginId,
        string currentPassword,
        string newPassword)
    {
        var login = await loginRepository.GetByIdAsync(loginId);
        if (login == null || !VerifyPassword(currentPassword, login.PasswordHash))
            return null;

        login.PasswordHash = HashPassword(newPassword);
        login.MustChangePassword = false;
        await loginRepository.SaveChangesAsync();

        return sidProtector.Protect(CreateToken(login.Id, login.LoginValue, false));
    }
    
    private string CreateToken(long loginId, string login, bool mustChangePassword)
    {
        var jwtKey = configuration["Jwt:Key"]!;
        var jwtIssuer = configuration["Jwt:Issuer"]!;
        var jwtAudience = configuration["Jwt:Audience"]!;
        
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        
        var claims = new List<System.Security.Claims.Claim>
        {
            new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier, loginId.ToString()),
            new System.Security.Claims.Claim("login", login),
            new System.Security.Claims.Claim("must_change_password", mustChangePassword.ToString().ToLowerInvariant())
        };
        
        var token = new JwtSecurityToken(
            issuer: jwtIssuer,
            audience: jwtAudience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(24),
            signingCredentials: creds);
        
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
    
    private static string HashPassword(string password)
    {
        using var sha256 = SHA256.Create();
        var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password));
        return Convert.ToBase64String(hashedBytes);
    }
    
    private static bool VerifyPassword(string password, string hash)
    {
        var hashOfInput = HashPassword(password);
        return hashOfInput == hash;
    }
}
