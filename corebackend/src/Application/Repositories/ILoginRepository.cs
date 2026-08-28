namespace Application.Repositories;

public interface ILoginRepository
{
    Task<Entities.Login?> GetByLoginAsync(string login);
    Task<Entities.Login?> GetByIdAsync(long id);
    Task AddAsync(Entities.Login login);
    Task SaveChangesAsync();
}
