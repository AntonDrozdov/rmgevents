using Application.Entities;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Data;

public sealed class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
    : DbContext(options)
{
    public DbSet<ImageEntity> Images => Set<ImageEntity>();
    public DbSet<Login> Logins => Set<Login>();
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<Event> Events => Set<Event>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<Group> Groups => Set<Group>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Guest> Guests => Set<Guest>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<GuestCategory> GuestCategories => Set<GuestCategory>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<GuestTag> GuestTags => Set<GuestTag>();
    public DbSet<GuestDecision> GuestDecisions => Set<GuestDecision>();
    public DbSet<EventLog> EventLogs => Set<EventLog>();
    public DbSet<OrganizationDepartment> OrganizationDepartments => Set<OrganizationDepartment>();
    public DbSet<OrganizationEmployee> OrganizationEmployees => Set<OrganizationEmployee>();
    public DbSet<GroupTemplate> GroupTemplates => Set<GroupTemplate>();
    public DbSet<GroupTemplateItem> GroupTemplateItems => Set<GroupTemplateItem>();

    [DbFunction("regexp_replace", IsBuiltIn = true)]
    public static string RegexpReplace(string input, string pattern, string replacement, string flags)
        => throw new NotSupportedException("This method is translated to PostgreSQL regexp_replace.");

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("corebackend");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
