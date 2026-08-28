namespace Application.Services;

public interface IAdminTokenService
{
    string? CreateToken(string login, string password);
}
