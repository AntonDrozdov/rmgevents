namespace Application.Repositories;

public interface IGuestRepository
{
    Task<Entities.Guest?> GetByIdAsync(long id);
    Task<List<Entities.Guest>> GetByEventIdAsync(long eventId);
    Task<List<Entities.Guest>> GetByGroupIdAsync(long groupId);
    Task<List<Entities.Guest>> GetByStatusAsync(long eventId, string status);
    Task<int> GetGuestCountByGroupAsync(long groupId);
    Task AddAsync(Entities.Guest guest);
    Task UpdateAsync(Entities.Guest guest);
    Task DeleteAsync(long id);
    Task SaveChangesAsync();
}
