using Application.Repositories;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public sealed class GroupRepository(ApplicationDbContext db) : IGroupRepository
{
    public async Task<Application.Entities.Group?> GetByIdAsync(Guid id)
    {
        return await db.Groups
            .Include(x => x.ChildGroups)
            .FirstOrDefaultAsync(x => x.Id == id);
    }
    
    public async Task<List<Application.Entities.Group>> GetByEventIdAsync(Guid eventId)
    {
        return await db.Groups
            .Where(x => x.EventId == eventId)
            .Include(x => x.ChildGroups)
            .ToListAsync();
    }
    
    public async Task<List<Application.Entities.Group>> GetRootGroupsByEventAsync(Guid eventId)
    {
        return await db.Groups
            .Where(x => x.EventId == eventId && x.ParentGroupId == null)
            .Include(x => x.ChildGroups)
            .ToListAsync();
    }
    
    public async Task<List<Application.Entities.Group>> GetChildrenAsync(Guid groupId)
    {
        return await db.Groups
            .Where(x => x.ParentGroupId == groupId)
            .ToListAsync();
    }
    
    public async Task<List<Application.Entities.Group>> GetAllDescendantsAsync(Guid groupId)
    {
        var descendants = new List<Application.Entities.Group>();
        var queue = new Queue<Guid>();
        queue.Enqueue(groupId);
        
        while (queue.Count > 0)
        {
            var currentId = queue.Dequeue();
            var children = await GetChildrenAsync(currentId);
            descendants.AddRange(children);
            
            foreach (var child in children)
            {
                queue.Enqueue(child.Id);
            }
        }
        
        return descendants;
    }
    
    public async Task AddAsync(Application.Entities.Group group)
    {
        await db.Groups.AddAsync(group);
    }
    
    public async Task UpdateAsync(Application.Entities.Group group)
    {
        db.Groups.Update(group);
        await Task.CompletedTask;
    }
    
    public async Task DeleteAsync(Guid id)
    {
        var group = await db.Groups.FindAsync(id);
        if (group != null)
        {
            db.Groups.Remove(group);
        }
    }
    
    public async Task SaveChangesAsync()
    {
        await db.SaveChangesAsync();
    }
}
