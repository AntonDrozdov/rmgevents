using Application.Repositories;
using Application.Services;
using Infrastructure.Data;
using Infrastructure.Repositories;
using Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        string connectionString)
    {
        services.AddDbContext<ApplicationDbContext>(options =>
            options.UseNpgsql(connectionString, npgsqlOptions =>
            {
                npgsqlOptions.EnableRetryOnFailure();
                npgsqlOptions.MigrationsHistoryTable("__EFMigrationsHistory", "corebackend");
            }));
        services.AddMemoryCache();
        
        services.AddScoped<IImageRepository, ImageRepository>();
        services.AddScoped<IImageService, ImageService>();
        services.AddSingleton<ISidProtector, SidProtector>();
        services.AddSingleton<IAdminTokenService, AdminTokenService>();
        
        // New repositories
        services.AddScoped<ILoginRepository, LoginRepository>();
        services.AddScoped<IEventRepository, EventRepository>();
        services.AddScoped<IRoleRepository, RoleRepository>();
        services.AddScoped<IPermissionRepository, PermissionRepository>();
        services.AddScoped<IGroupRepository, GroupRepository>();
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IGuestRepository, GuestRepository>();
        services.AddScoped<ICategoryRepository, CategoryRepository>();
        services.AddScoped<ITagRepository, TagRepository>();
        services.AddScoped<IEventLogRepository, EventLogRepository>();
        
        // New services
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IEventService, EventService>();
        services.AddScoped<IGroupService, GroupService>();
        services.AddScoped<IGuestService, GuestService>();
        services.AddScoped<ICategoryService, CategoryService>();
        services.AddScoped<ITagService, TagService>();
        services.AddScoped<IUserService, UserService>();
        services.AddScoped<IPermissionService, PermissionService>();
        services.AddScoped<IRoleService, RoleService>();
        services.AddScoped<IEventStateGuard, EventStateGuard>();
        services.AddScoped<IEventLogService, EventLogService>();
        services.AddScoped<IOrganizationStructureService, OrganizationStructureService>();
        services.AddScoped<IGroupTemplateService, GroupTemplateService>();

        return services;
    }
}
