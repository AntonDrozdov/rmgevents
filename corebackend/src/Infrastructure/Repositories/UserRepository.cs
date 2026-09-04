using Application.Repositories;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public sealed class UserRepository(ApplicationDbContext db) : IUserRepository
{
    public async Task<Application.Entities.User?> GetByIdAsync(long id)
    {
        return await db.Users
            .Include(x => x.Role)
            .ThenInclude(x => x!.RolePermissions)
            .ThenInclude(x => x.Permission)
            .Include(x => x.Group)
            .Include(x => x.Login)
            .FirstOrDefaultAsync(x => x.Id == id);
    }
    
    public async Task<List<Application.Entities.User>> GetByLoginIdAsync(long loginId)
    {
        return await db.Users
            .Where(x => x.LoginId == loginId)
            .Include(x => x.Event)
            .ThenInclude(x => x!.Owner)
            .Include(x => x.Role)
            .ThenInclude(x => x!.RolePermissions)
            .ThenInclude(x => x.Permission)
            .Include(x => x.Group)
            .Include(x => x.Login)
            .ToListAsync();
    }
    
    public async Task<Application.Entities.User?> GetByLoginAndEventAsync(long loginId, long eventId)
    {
        return await db.Users
            .Where(x => x.LoginId == loginId && x.EventId == eventId)
            .Include(x => x.Role)
            .ThenInclude(x => x!.RolePermissions)
            .ThenInclude(x => x.Permission)
            .Include(x => x.Group)
            .Include(x => x.Login)
            .FirstOrDefaultAsync();
    }
    
    public async Task<List<Application.Entities.User>> GetByEventIdAsync(long eventId)
    {
        return await db.Users
            .Where(x => x.EventId == eventId)
            .Include(x => x.Role)
            .Include(x => x.Group)
            .Include(x => x.Login)
            .ToListAsync();
    }

    public async Task<List<Application.Entities.User>> SearchForEventAsync(
        long eventId,
        string? login,
        string? surname,
        string? name,
        string? email,
        int limit)
    {
        var query = db.Users
            .AsNoTracking()
            .Where(user => user.EventId != eventId)
            .Where(user => !db.Users.Any(current =>
                current.EventId == eventId && current.LoginId == user.LoginId))
            .Include(user => user.Login)
            .Include(user => user.Role)
            .Include(user => user.Group)
            .AsQueryable();

        var hasLogin = !string.IsNullOrWhiteSpace(login);
        var hasSurname = !string.IsNullOrWhiteSpace(surname);
        var hasName = !string.IsNullOrWhiteSpace(name);
        var hasEmail = !string.IsNullOrWhiteSpace(email);

        if (!hasLogin && !hasSurname && !hasName && !hasEmail)
            return [];

        query = query.Where(user =>
            (hasLogin && user.Login != null && EF.Functions.ILike(user.Login.LoginValue, $"%{login}%")) ||
            (hasSurname && EF.Functions.ILike(user.Surname, $"%{surname}%")) ||
            (hasName && EF.Functions.ILike(user.Name, $"%{name}%")) ||
            (hasEmail && user.Email != null && EF.Functions.ILike(user.Email, $"%{email}%")));

        var candidates = await query
            .OrderByDescending(user => user.CreatedAt)
            .Take(limit * 5)
            .ToListAsync();

        static int MatchScore(string? value, string? searchValue)
        {
            if (string.IsNullOrWhiteSpace(value) || string.IsNullOrWhiteSpace(searchValue))
                return 0;
            if (string.Equals(value, searchValue, StringComparison.OrdinalIgnoreCase))
                return 100;
            if (value.StartsWith(searchValue, StringComparison.OrdinalIgnoreCase))
                return 20;
            return value.Contains(searchValue, StringComparison.OrdinalIgnoreCase) ? 5 : 0;
        }

        return candidates
            .Select(user => new
            {
                User = user,
                Score = MatchScore(user.Login?.LoginValue, login)
                    + MatchScore(user.Surname, surname)
                    + MatchScore(user.Name, name)
                    + MatchScore(user.Email, email)
            })
            .GroupBy(item => item.User.LoginId)
            .Select(group => group
                .OrderByDescending(item => item.Score)
                .ThenByDescending(item => item.User.CreatedAt)
                .First())
            .OrderByDescending(item => item.Score)
            .ThenByDescending(item => item.User.CreatedAt)
            .Take(limit)
            .Select(item => item.User)
            .ToList();
    }
    
    public async Task<List<Application.Entities.User>> GetByGroupIdAsync(long groupId)
    {
        return await db.Users
            .Where(x => x.GroupId == groupId)
            .Include(x => x.Role)
            .ToListAsync();
    }
    
    public async Task AddAsync(Application.Entities.User user)
    {
        await db.Users.AddAsync(user);
    }
    
    public async Task UpdateAsync(Application.Entities.User user)
    {
        db.Users.Update(user);
        await Task.CompletedTask;
    }
    
    public async Task DeleteAsync(long id)
    {
        var user = await db.Users.FindAsync(id);
        if (user != null)
        {
            db.Users.Remove(user);
        }
    }
    
    public async Task SaveChangesAsync()
    {
        await db.SaveChangesAsync();
    }
}
