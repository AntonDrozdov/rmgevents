namespace Application.Services;

public interface IAdminTokenService
{
    string? CreateToken(string username, string password);
}
