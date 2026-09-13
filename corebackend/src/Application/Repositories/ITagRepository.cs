namespace Application.Repositories;

public interface ITagRepository
{
    Task<Entities.Tag?> GetByIdAsync(long id);
    Task<List<Entities.Tag>> GetByEventIdAsync(long eventId);
    Task<List<Entities.Tag>> GetByIdsAsync(IReadOnlyCollection<long> ids);
    Task<bool> ExistsByNameAsync(long eventId, string name, long? excludeTagId = null);
    Task AddAsync(Entities.Tag tag);
    Task UpdateAsync(Entities.Tag tag);
    Task DeleteAsync(long id);
    Task SaveChangesAsync();
}
