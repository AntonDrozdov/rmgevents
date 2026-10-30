using System.Net.Http.Headers;
using System.Text.Json;

namespace WebApi;

public sealed record AssistantModelOption(
    int? CostRank,
    string Id,
    string Name,
    decimal? InputPricePerThousandTokens,
    decimal? OutputPricePerThousandTokens,
    string? Context,
    string? RecommendedUse,
    string OwnedBy);

public sealed record AssistantModelPrice(
    int CostRank,
    string Id,
    string Name,
    decimal InputPricePerThousandTokens,
    decimal OutputPricePerThousandTokens,
    string Context,
    string RecommendedUse);

public static class AssistantModelCatalog
{
    // Price metadata source: deploy/yandexmodels_29102026.md.
    public static IReadOnlyList<AssistantModelPrice> Prices { get; } =
    [
        new(1, "aliceai-llm-flash", "AliceAI LLM Flash", 0.10m, 0.20m, "64k", "Быстрый чат, рерайт и форматирование"),
        new(2, "yandexgpt-5-lite", "YandexGPT 5 Lite", 0.15m, 0.45m, "8k", "Экономичные простые запросы; модель устаревает"),
        new(3, "deepseek-v4.1-flash", "DeepSeek V4.1 Flash", 0.30m, 0.50m, "1M", "Инструменты, JSON и большой контекст"),
        new(4, "qwen3.6-35b-a3b", "Qwen 3.6 35B A3B", 0.50m, 1.00m, "256k", "Код и сложная структурированная логика"),
        new(5, "yandexgpt-5.1", "YandexGPT 5.1", 0.60m, 1.20m, "32k", "Тяжёлая аналитика и длинные инструкции"),
        new(6, "aliceai-llm", "AliceAI LLM", 0.60m, 1.20m, "128k", "Умный диалог и креативные задачи")
    ];
}

public interface IYandexModelService
{
    Task<IReadOnlyList<AssistantModelOption>> ListAsync(bool forceRefresh, CancellationToken ct);
    Task<string?> ResolveUriAsync(string id, CancellationToken ct);
}

public sealed class YandexModelListException(int statusCode) : Exception("Yandex models request failed")
{
    public int StatusCode { get; } = statusCode;
}

public sealed class YandexModelService(IHttpClientFactory clients, IConfiguration configuration) : IYandexModelService, IDisposable
{
    private readonly SemaphoreSlim refreshLock = new(1, 1);
    private IReadOnlyList<AssistantModelOption> options = [];
    private IReadOnlyDictionary<string, string> uriById = new Dictionary<string, string>();
    private DateTimeOffset expiresAt;

    public async Task<IReadOnlyList<AssistantModelOption>> ListAsync(bool forceRefresh, CancellationToken ct)
    {
        if (!forceRefresh && options.Count > 0 && expiresAt > DateTimeOffset.UtcNow) return options;
        await refreshLock.WaitAsync(ct);
        try
        {
            if (!forceRefresh && options.Count > 0 && expiresAt > DateTimeOffset.UtcNow) return options;
            await RefreshAsync(ct);
            return options;
        }
        finally { refreshLock.Release(); }
    }

    public async Task<string?> ResolveUriAsync(string id, CancellationToken ct)
    {
        await ListAsync(false, ct);
        if (uriById.TryGetValue(id, out var uri)) return uri;
        await ListAsync(true, ct);
        return uriById.GetValueOrDefault(id);
    }

    private async Task RefreshAsync(CancellationToken ct)
    {
        var apiKey = configuration["YandexAI:ApiKey"];
        var folderId = configuration["YandexAI:FolderId"];
        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(folderId))
            throw new InvalidOperationException("Yandex AI Studio is not configured");

        using var request = new HttpRequestMessage(HttpMethod.Get, "https://ai.api.cloud.yandex.net/v1/models");
        request.Headers.Authorization = new AuthenticationHeaderValue("Api-Key", apiKey);
        request.Headers.Add("x-project", folderId);
        using var response = await clients.CreateClient("YandexAI").SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!response.IsSuccessStatusCode) throw new YandexModelListException((int)response.StatusCode);
        await response.Content.LoadIntoBufferAsync(1_000_000, ct);
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var json = await JsonDocument.ParseAsync(stream, new JsonDocumentOptions { MaxDepth = 32 }, ct);
        if (!json.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
            throw new JsonException("Models list is missing");

        var prices = AssistantModelCatalog.Prices.ToDictionary(item => item.Id, StringComparer.Ordinal);
        var next = new Dictionary<string, (AssistantModelOption Option, string Uri)>(StringComparer.Ordinal);
        foreach (var model in data.EnumerateArray())
        {
            if (!model.TryGetProperty("id", out var idValue) || idValue.ValueKind != JsonValueKind.String) continue;
            var uri = idValue.GetString();
            if (string.IsNullOrWhiteSpace(uri) || !uri.StartsWith("gpt://", StringComparison.Ordinal) || uri.Length > 300) continue;
            var folderSeparator = uri.IndexOf('/', "gpt://".Length);
            if (folderSeparator < 0 || folderSeparator == uri.Length - 1) continue;
            var id = uri[(folderSeparator + 1)..];
            var baseId = id.Split('/', 2)[0].Split('@', 2)[0];
            prices.TryGetValue(baseId, out var price);
            var suffix = id.Length > baseId.Length ? id[baseId.Length..].TrimStart('/') : "";
            var name = price is null ? id : string.IsNullOrEmpty(suffix) ? price.Name : $"{price.Name} · {suffix}";
            var ownedBy = model.TryGetProperty("owned_by", out var owner) && owner.ValueKind == JsonValueKind.String
                ? owner.GetString() ?? "Yandex" : "Yandex";
            next[id] = (new(
                price?.CostRank, id, name,
                price?.InputPricePerThousandTokens, price?.OutputPricePerThousandTokens,
                price?.Context, price?.RecommendedUse, ownedBy), uri);
        }
        if (next.Count == 0) throw new JsonException("No chat models are available");

        options = next.Values.Select(item => item.Option)
            .OrderBy(item => item.CostRank ?? int.MaxValue)
            .ThenBy(item => item.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        uriById = next.ToDictionary(item => item.Key, item => item.Value.Uri, StringComparer.Ordinal);
        expiresAt = DateTimeOffset.UtcNow.AddMinutes(10);
    }

    public void Dispose()
    {
        refreshLock.Dispose();
        GC.SuppressFinalize(this);
    }
}
