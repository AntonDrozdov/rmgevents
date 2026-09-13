namespace Application.Services;

public interface ICategoryService
{
    Task<List<Entities.Category>> GetCategoriesByEventAsync(long eventId, long loginId);
    Task<Entities.Category> CreateCategoryAsync(long eventId, long loginId, string name, string color);
    Task<Entities.Category> UpdateCategoryAsync(long eventId, long categoryId, long loginId, string name, string color);
    Task DeleteCategoryAsync(long eventId, long categoryId, long loginId);
}
