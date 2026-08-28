using Application.Repositories;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public sealed class LoginRepository(ApplicationDbContext db) : ILoginRepository
{
    public async Task<Application.Entities.Login?> GetByLoginAsync(string login)
    {
        return await db.Logins
            .FirstOrDefaultAsync(x => x.LoginValue == login);
    }
    
    public async Task<Application.Entities.Login?> GetByIdAsync(long id)
    {
        return await db.Logins.FindAsync(id);
    }
    
    public async Task AddAsync(Application.Entities.Login login)
    {
        await db.Logins.AddAsync(login);
    }
    
    public async Task SaveChangesAsync()
    {
        await db.SaveChangesAsync();
    }
}
