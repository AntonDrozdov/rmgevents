using System.Security.Claims;
using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;

namespace WebApi;

/// <summary>
/// Replays a completed AIMode mutation when the browser retries after losing the response.
/// Authorization and the normal endpoint still run for the first attempt.
/// </summary>
public sealed class AssistantIdempotencyMiddleware(RequestDelegate next)
{
    private const string Header = "X-Assistant-Action-Id";
    private sealed record CachedResponse(int StatusCode, string? ContentType, string BodyBase64);

    public async Task InvokeAsync(HttpContext context, IDistributedCache cache, ILogger<AssistantIdempotencyMiddleware> logger)
    {
        var method = context.Request.Method;
        var id = context.Request.Headers[Header].FirstOrDefault();
        var loginId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (method is not ("POST" or "PUT" or "PATCH" or "DELETE")
            || string.IsNullOrWhiteSpace(loginId)
            || id is null || id.Length != 48 || !id.All(Uri.IsHexDigit))
        {
            await next(context);
            return;
        }

        var target = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes($"{method}:{context.Request.Path}{context.Request.QueryString}")));
        var key = $"rmgevents:assistant:result:{loginId}:{id.ToUpperInvariant()}:{target}";
        string? cachedJson = null;
        try { cachedJson = await cache.GetStringAsync(key, context.RequestAborted); }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning("AIMode idempotency cache read failed: {Type}", ex.GetType().Name);
        }
        if (!string.IsNullOrWhiteSpace(cachedJson))
        {
            var cached = JsonSerializer.Deserialize<CachedResponse>(cachedJson);
            if (cached is not null)
            {
                context.Response.StatusCode = cached.StatusCode;
                context.Response.ContentType = cached.ContentType;
                await context.Response.Body.WriteAsync(Convert.FromBase64String(cached.BodyBase64), context.RequestAborted);
                return;
            }
        }

        var originalBody = context.Response.Body;
        await using var buffer = new MemoryStream();
        context.Response.Body = buffer;
        try
        {
            await next(context);
            if (context.Response.StatusCode < 500 && buffer.Length <= 1_000_000)
            {
                var snapshot = new CachedResponse(context.Response.StatusCode, context.Response.ContentType,
                    Convert.ToBase64String(buffer.ToArray()));
                try
                {
                    await cache.SetStringAsync(key, JsonSerializer.Serialize(snapshot),
                        new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(15) },
                        CancellationToken.None);
                }
                catch (Exception ex)
                {
                    logger.LogWarning("AIMode idempotency cache write failed: {Type}", ex.GetType().Name);
                }
            }
            buffer.Position = 0;
            await buffer.CopyToAsync(originalBody, context.RequestAborted);
        }
        finally
        {
            context.Response.Body = originalBody;
        }
    }
}
