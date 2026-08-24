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
                npgsqlOptions.EnableRetryOnFailure()));
        services.AddScoped<IImageRepository, ImageRepository>();
        services.AddScoped<IImageService, ImageService>();
        services.AddScoped<ICatalogRepository, CatalogRepository>();
        services.AddScoped<ICatalogService, CatalogService>();
        services.AddSingleton<IAdminTokenService, AdminTokenService>();

        return services;
    }
}
