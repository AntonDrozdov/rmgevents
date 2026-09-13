using Application.Repositories;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public sealed class TagRepository(ApplicationDbContext db) : ITagRepository
{
    public async Task<Application.Entities.Tag?> GetByIdAsync(long id)
    {
        return await db.Tags
            .Include(x => x.Event)
            .FirstOrDefaultAsync(x => x.Id == id);
    }

    public async Task<List<Application.Entities.Tag>> GetByEventIdAsync(long eventId)
    {
        return await db.Tags
            .AsNoTracking()
            .Where(x => x.EventId == eventId)
            .OrderBy(x => x.Name)
            .ToListAsync();
    }

    public async Task<List<Application.Entities.Tag>> GetByIdsAsync(IReadOnlyCollection<long> ids)
    {
        if (ids.Count == 0)
            return [];

        return await db.Tags
            .Where(x => ids.Contains(x.Id))
            .ToListAsync();
    }

    public async Task<bool> ExistsByNameAsync(long eventId, string name, long? excludeTagId = null)
    {
        var normalizedName = name.Trim();
        return await db.Tags.AnyAsync(x =>
            x.EventId == eventId &&
            x.Name == normalizedName &&
            (!excludeTagId.HasValue || x.Id != excludeTagId.Value));
    }

    public async Task AddAsync(Application.Entities.Tag tag)
    {
        await db.Tags.AddAsync(tag);
    }

    public async Task UpdateAsync(Application.Entities.Tag tag)
    {
        db.Tags.Update(tag);
        await Task.CompletedTask;
    }

    public async Task DeleteAsync(long id)
    {
        var tag = await db.Tags.FindAsync(id);
        if (tag != null)
        {
            db.Tags.Remove(tag);
        }
    }

    public async Task SaveChangesAsync()
    {
        await db.SaveChangesAsync();
    }
}
