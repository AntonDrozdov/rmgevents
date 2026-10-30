using System.Security.Claims;
using System.Threading.RateLimiting;

namespace WebApi;

public static class AssistantRegistration
{
    public static IServiceCollection AddAssistant(this IServiceCollection services)
    {
        services.AddDistributedMemoryCache();
        services.AddHttpClient("YandexAI", client => client.Timeout = TimeSpan.FromSeconds(50));
        services.AddSingleton<IYandexModelService, YandexModelService>();
        services.AddScoped<IAssistantTools, AssistantTools>();
        services.AddScoped<YandexAssistantClient>();
        services.AddSingleton<AssistantActionStore>();
        services.AddScoped<AssistantActionCatalog>();
        services.AddScoped<AssistantActions>();
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = async (context, ct) =>
            {
                context.HttpContext.Response.Headers.RetryAfter = "60";
                await context.HttpContext.Response.WriteAsJsonAsync(new { message = "Слишком много запросов AIMode. Попробуйте через минуту." }, ct);
            };
            options.AddPolicy("assistant", context => RateLimitPartition.GetFixedWindowLimiter(
                context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "anonymous",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
        });
        return services;
    }
}
