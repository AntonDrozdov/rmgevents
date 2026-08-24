namespace Application.Repositories;

public interface IUserRepository
{
    Task<Entities.User?> GetByIdAsync(Guid id);
    Task<List<Entities.User>> GetByLoginIdAsync(Guid loginId);
    Task<Entities.User?> GetByLoginAndEventAsync(Guid loginId, Guid eventId);
    Task<List<Entities.User>> GetByEventIdAsync(Guid eventId);
    Task<List<Entities.User>> GetByGroupIdAsync(Guid groupId);
    Task AddAsync(Entities.User user);
    Task UpdateAsync(Entities.User user);
    Task DeleteAsync(Guid id);
    Task SaveChangesAsync();
}
