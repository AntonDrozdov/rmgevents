namespace Application.Repositories;

public interface ICategoryRepository
{
    Task<Entities.Category?> GetByIdAsync(long id);
    Task<List<Entities.Category>> GetByEventIdAsync(long eventId);
    Task<bool> ExistsByNameAsync(long eventId, string name, long? excludeCategoryId = null);
    Task AddAsync(Entities.Category category);
    Task UpdateAsync(Entities.Category category);
    Task DeleteAsync(long id);
    Task SaveChangesAsync();
}
