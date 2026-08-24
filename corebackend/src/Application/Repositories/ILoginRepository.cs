namespace Application.Repositories;

public interface ILoginRepository
{
    Task<Entities.Login?> GetByUsernameAsync(string username);
    Task<Entities.Login?> GetByIdAsync(Guid id);
    Task AddAsync(Entities.Login login);
    Task SaveChangesAsync();
}
