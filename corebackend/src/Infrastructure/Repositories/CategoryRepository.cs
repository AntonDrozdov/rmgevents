using Application.Repositories;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public sealed class CategoryRepository(ApplicationDbContext db) : ICategoryRepository
{
    public async Task<Application.Entities.Category?> GetByIdAsync(long id)
    {
        return await db.Categories
            .Include(x => x.Event)
            .FirstOrDefaultAsync(x => x.Id == id);
    }

    public async Task<List<Application.Entities.Category>> GetByEventIdAsync(long eventId)
    {
        return await db.Categories
            .AsNoTracking()
            .Where(x => x.EventId == eventId)
            .OrderBy(x => x.Name)
            .ToListAsync();
    }

    public async Task<bool> ExistsByNameAsync(long eventId, string name, long? excludeCategoryId = null)
    {
        var normalizedName = name.Trim();
        return await db.Categories.AnyAsync(x =>
            x.EventId == eventId &&
            x.Name == normalizedName &&
            (!excludeCategoryId.HasValue || x.Id != excludeCategoryId.Value));
    }

    public async Task AddAsync(Application.Entities.Category category)
    {
        await db.Categories.AddAsync(category);
    }

    public async Task UpdateAsync(Application.Entities.Category category)
    {
        db.Categories.Update(category);
        await Task.CompletedTask;
    }

    public async Task DeleteAsync(long id)
    {
        var category = await db.Categories.FindAsync(id);
        if (category != null)
        {
            db.Categories.Remove(category);
        }
    }

    public async Task SaveChangesAsync()
    {
        await db.SaveChangesAsync();
    }
}
