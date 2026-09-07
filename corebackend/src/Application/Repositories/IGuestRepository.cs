namespace Application.Repositories;

public interface IGuestRepository
{
    Task<Entities.Guest?> GetByIdAsync(long id);
    Task<List<Entities.Guest>> GetByEventIdAsync(long eventId);
    Task<(List<Entities.Guest> Items, int TotalCount, int Page)> GetPageByEventIdAsync(
        long eventId,
        string? search,
        string? status,
        int page,
        int pageSize);
    Task<List<Entities.Guest>> GetByGroupIdAsync(long groupId);
    Task<bool> ExistsByGroupIdsAsync(IReadOnlyCollection<long> groupIds);
    Task<List<Entities.Guest>> GetByStatusAsync(long eventId, string status);
    Task<List<Entities.Guest>> SearchForEventAsync(
        long eventId,
        string? name,
        string? email,
        string? phone,
        int limit);
    Task<int> GetGuestCountByGroupAsync(long groupId);
    Task AddAsync(Entities.Guest guest);
    Task UpdateAsync(Entities.Guest guest);
    Task DeleteAsync(long id);
    Task SaveChangesAsync();
}
