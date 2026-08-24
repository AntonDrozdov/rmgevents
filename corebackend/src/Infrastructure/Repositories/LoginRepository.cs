using Application.Repositories;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public sealed class LoginRepository(ApplicationDbContext db) : ILoginRepository
{
    public async Task<Application.Entities.Login?> GetByUsernameAsync(string username)
    {
        return await db.Logins
            .FirstOrDefaultAsync(x => x.Username == username);
    }
    
    public async Task<Application.Entities.Login?> GetByIdAsync(Guid id)
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
