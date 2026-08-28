namespace Application.Repositories;

public interface IUserRepository
{
    Task<Entities.User?> GetByIdAsync(long id);
    Task<List<Entities.User>> GetByLoginIdAsync(long loginId);
    Task<Entities.User?> GetByLoginAndEventAsync(long loginId, long eventId);
    Task<List<Entities.User>> GetByEventIdAsync(long eventId);
    Task<List<Entities.User>> GetByGroupIdAsync(long groupId);
    Task AddAsync(Entities.User user);
    Task UpdateAsync(Entities.User user);
    Task DeleteAsync(long id);
    Task SaveChangesAsync();
}
