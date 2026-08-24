namespace Application.Repositories;

public interface IGuestRepository
{
    Task<Entities.Guest?> GetByIdAsync(Guid id);
    Task<List<Entities.Guest>> GetByEventIdAsync(Guid eventId);
    Task<List<Entities.Guest>> GetByGroupIdAsync(Guid groupId);
    Task<List<Entities.Guest>> GetByStatusAsync(Guid eventId, string status);
    Task<int> GetGuestCountByGroupAsync(Guid groupId);
    Task AddAsync(Entities.Guest guest);
    Task UpdateAsync(Entities.Guest guest);
    Task DeleteAsync(Guid id);
    Task SaveChangesAsync();
}
