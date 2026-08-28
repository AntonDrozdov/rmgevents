using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Application.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace Infrastructure.Services;

public sealed class AdminTokenService(IConfiguration configuration, ISidProtector sidProtector) : IAdminTokenService
{
    public string? CreateToken(string login, string password)
    {
        var expectedLogin = configuration["Admin:Login"];
        var expectedPassword = configuration["Admin:Password"];
        if (!string.Equals(login, expectedLogin, StringComparison.Ordinal) ||
            !string.Equals(password, expectedPassword, StringComparison.Ordinal))
            return null;

        var key = configuration["Jwt:Key"]
            ?? throw new InvalidOperationException("JWT key is not configured.");
        var issuer = configuration["Jwt:Issuer"] ?? "EA";
        var audience = configuration["Jwt:Audience"] ?? "EA.Admin";
        var expires = DateTime.UtcNow.AddHours(8);
        var token = new JwtSecurityToken(
            issuer, audience,
            [new Claim(ClaimTypes.Name, login), new Claim(ClaimTypes.Role, "Admin")],
            expires: expires,
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256));
        return sidProtector.Protect(new JwtSecurityTokenHandler().WriteToken(token));
    }
}
