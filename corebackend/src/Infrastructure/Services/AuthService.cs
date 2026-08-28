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
    public async Task<(long LoginId, string Sid)?> LoginAsync(string loginValue, string password)
    {
        var login = await loginRepository.GetByLoginAsync(loginValue);
        if (login == null || !VerifyPassword(password, login.PasswordHash))
            return null;
        
        return (login.Id, sidProtector.Protect(CreateToken(login.Id, login.LoginValue)));
    }
    
    public async Task<List<(long EventId, string EventName, string RoleName)>> GetAvailableEventsAsync(long loginId)
    {
        var users = await userRepository.GetByLoginIdAsync(loginId);
        var result = new List<(long, string, string)>();
        
        foreach (var user in users)
        {
            if (user.Event != null && user.Role != null)
            {
                result.Add((user.EventId, user.Event.Name, user.Role.Name));
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
            CreatedAt = DateTimeOffset.UtcNow
        };
        
        await loginRepository.AddAsync(login);
        await loginRepository.SaveChangesAsync();
        
        return login.Id;
    }
    
    private string CreateToken(long loginId, string login)
    {
        var jwtKey = configuration["Jwt:Key"]!;
        var jwtIssuer = configuration["Jwt:Issuer"]!;
        var jwtAudience = configuration["Jwt:Audience"]!;
        
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        
        var claims = new List<System.Security.Claims.Claim>
        {
            new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier, loginId.ToString()),
            new System.Security.Claims.Claim("login", login)
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
