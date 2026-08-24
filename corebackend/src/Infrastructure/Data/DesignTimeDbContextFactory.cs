using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Infrastructure.Data;

public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
{
    public ApplicationDbContext CreateDbContext(string[] args)
    {
        var builder = new DbContextOptionsBuilder<ApplicationDbContext>();
        var connectionString = "Host=localhost;Port=5432;Database=rmgevents;Username=postgres;Password=admin";
        builder.UseNpgsql(connectionString, options =>
            options.MigrationsHistoryTable("__EFMigrationsHistory", "corebackend"));
        return new ApplicationDbContext(builder.Options);
    }
}
