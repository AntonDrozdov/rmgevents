namespace Application.Repositories;

public interface IGuestRepository
{
    Task<Entities.Guest?> GetByIdAsync(long id, bool includeDeleted = false);
    Task<Entities.Guest?> GetByPublicIdAsync(Guid publicId);
    Task<List<Entities.Guest>> GetByEventIdAsync(long eventId);
    Task<(List<Entities.Guest> Items, int TotalCount, int Page)> GetPageByEventIdAsync(
        long eventId,
        string? search,
        IReadOnlyCollection<string> statuses,
        bool eligibleForSeating,
        IReadOnlyCollection<long> categoryIds,
        IReadOnlyCollection<long> tagIds,
        IReadOnlyCollection<long> groupIds,
        IReadOnlyCollection<long> createdByUserIds,
        bool includeDeleted,
        string? sortBy,
        bool sortDescending,
        int page,
        int pageSize);
    Task<List<Entities.Guest>> GetForBulkAsync(long eventId, GuestSelection selection);
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
    Task SetGuestCategoryAsync(long guestId, long? categoryId);
    Task SetGuestTagsAsync(long guestId, IReadOnlyCollection<long> tagIds);
    Task SaveChangesAsync();
}
