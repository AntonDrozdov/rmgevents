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
    IConfiguration configuration) : IAuthService
{
    public async Task<string?> LoginAsync(string username, string password)
    {
        var login = await loginRepository.GetByUsernameAsync(username);
        if (login == null || !VerifyPassword(password, login.PasswordHash))
            return null;
        
        return CreateToken(login.Id, login.Username);
    }
    
    public async Task<List<(Guid EventId, string EventName, string RoleName)>> GetAvailableEventsAsync(Guid loginId)
    {
        var users = await userRepository.GetByLoginIdAsync(loginId);
        var result = new List<(Guid, string, string)>();
        
        foreach (var user in users)
        {
            if (user.Event != null && user.Role != null)
            {
                result.Add((user.EventId, user.Event.Name, user.Role.Name));
            }
        }
        
        return result;
    }
    
    public async Task<Guid?> RegisterUserAsync(string username, string password, string displayName)
    {
        var existingLogin = await loginRepository.GetByUsernameAsync(username);
        if (existingLogin != null)
            return null;
        
        var passwordHash = HashPassword(password);
        var login = new Application.Entities.Login
        {
            Id = Guid.NewGuid(),
            Username = username,
            PasswordHash = passwordHash,
            CreatedAt = DateTimeOffset.UtcNow
        };
        
        await loginRepository.AddAsync(login);
        await loginRepository.SaveChangesAsync();
        
        return login.Id;
    }
    
    private string CreateToken(Guid loginId, string username)
    {
        var jwtKey = configuration["Jwt:Key"]!;
        var jwtIssuer = configuration["Jwt:Issuer"]!;
        var jwtAudience = configuration["Jwt:Audience"]!;
        
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        
        var claims = new List<System.Security.Claims.Claim>
        {
            new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier, loginId.ToString()),
            new System.Security.Claims.Claim("username", username)
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
