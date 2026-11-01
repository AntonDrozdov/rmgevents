using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace WebApi;

public sealed record AssistantTokenUsage(long InputTokens, long OutputTokens, long TotalTokens);
public sealed record AssistantAnswer(string Answer, IReadOnlyList<string> Sources,
    IReadOnlyList<AssistantActionView>? Actions = null, AssistantTokenUsage? Usage = null);
public sealed class YandexAssistantException(int statusCode) : Exception("Yandex AI request failed")
{
    public int StatusCode { get; } = statusCode;
}

public sealed class YandexAssistantClient(IHttpClientFactory clients, IConfiguration configuration, IAssistantTools tools)
{
    private const int MaxRounds = 6;
    private const int MaxToolCalls = 12;
    private static readonly string[] ZeroArgumentReadTools =
        ["get_event_summary", "list_guests", "get_groups", "get_placements", "get_event_catalogs", "list_staff", "get_staff_summary"];
    private static readonly string[] ArgumentReadTools = ["search_guests", "get_guest_neighbors", "search_guests_across_events", "search_staff", "search_staff_across_events"];

    public async Task<AssistantAnswer> CompleteAsync(IEnumerable<object> initialMessages, long loginId, long? eventId,
        string modelUri, CancellationToken ct, string? requiredInitialTool = null, JsonElement? requiredInitialArguments = null)
    {
        if (!modelUri.StartsWith("gpt://", StringComparison.Ordinal) || modelUri.Length > 300)
            throw new ArgumentOutOfRangeException(nameof(modelUri));
        if (requiredInitialTool is not null
            && !ZeroArgumentReadTools.Contains(requiredInitialTool, StringComparer.Ordinal)
            && !ArgumentReadTools.Contains(requiredInitialTool, StringComparer.Ordinal))
            throw new ArgumentOutOfRangeException(nameof(requiredInitialTool));
        var forcedArguments = requiredInitialTool is not null && ArgumentReadTools.Contains(requiredInitialTool, StringComparer.Ordinal)
            ? requiredInitialArguments ?? throw new ArgumentNullException(nameof(requiredInitialArguments))
            : JsonSerializer.Deserialize<JsonElement>("{}");
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(50));
        var folderId = configuration["YandexAI:FolderId"];
        var messages = JsonSerializer.SerializeToNode(initialMessages)!.AsArray();
        var sources = new HashSet<string>();
        var calls = 0;
        long inputTokens = 0, outputTokens = 0, totalTokens = 0;
        var hasUsage = false;
        AssistantTokenUsage? Usage() => hasUsage ? new(inputTokens, outputTokens,
            totalTokens > 0 ? totalTokens : inputTokens + outputTokens) : null;
        var client = clients.CreateClient("YandexAI");
        // A write request can require several dependent reads (guest, group and catalogs)
        // before the model has enough server IDs to prepare the confirmation card.
        for (var round = 0; round < MaxRounds; round++)
        {
            object toolChoice = round == MaxRounds - 1
                ? "none"
                : round == 0 && requiredInitialTool is not null
                    ? new { type = "function", function = new { name = requiredInitialTool } }
                    : "auto";
            using var request = new HttpRequestMessage(HttpMethod.Post, "https://ai.api.cloud.yandex.net/v1/chat/completions");
            request.Headers.Authorization = new AuthenticationHeaderValue("Api-Key", configuration["YandexAI:ApiKey"]);
            request.Headers.Add("OpenAI-Project", folderId);
            request.Content = JsonContent.Create(new {
                model = modelUri, messages,
                tools = AssistantTools.Definitions, tool_choice = toolChoice,
                temperature = 0.2, max_tokens = 1600, stream = false
            });
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, deadline.Token);
            if (!response.IsSuccessStatusCode) throw new YandexAssistantException((int)response.StatusCode);
            // Bound provider output before parsing it; never log messages, secrets or returned data.
            await using var stream = await response.Content.ReadAsStreamAsync(deadline.Token);
            using var buffer = new MemoryStream();
            var chunk = new byte[8192];
            int length;
            while ((length = await stream.ReadAsync(chunk, deadline.Token)) > 0)
            {
                if (buffer.Length + length > 256_000) throw new JsonException("Provider output limit exceeded");
                buffer.Write(chunk, 0, length);
            }
            using var json = JsonDocument.Parse(buffer.ToArray());
            if (json.RootElement.TryGetProperty("usage", out var usage) && usage.ValueKind == JsonValueKind.Object)
            {
                static long Read(JsonElement value, params string[] names)
                {
                    foreach (var name in names)
                        if (value.TryGetProperty(name, out var item) && item.ValueKind == JsonValueKind.Number
                            && item.TryGetInt64(out var result) && result >= 0) return result;
                    return 0;
                }
                var currentInput = Read(usage, "prompt_tokens", "input_tokens");
                var currentOutput = Read(usage, "completion_tokens", "output_tokens");
                var currentTotal = Read(usage, "total_tokens");
                inputTokens += currentInput;
                outputTokens += currentOutput;
                totalTokens += currentTotal > 0 ? currentTotal : currentInput + currentOutput;
                hasUsage = true;
            }
            var choices = json.RootElement.GetProperty("choices");
            if (choices.ValueKind != JsonValueKind.Array || choices.GetArrayLength() == 0) throw new JsonException("No choices");
            var message = choices[0].GetProperty("message");
            if (!message.TryGetProperty("tool_calls", out var toolCalls) || toolCalls.ValueKind == JsonValueKind.Null || toolCalls.GetArrayLength() == 0)
            {
                var answer = message.GetProperty("content").GetString();
                if (string.IsNullOrWhiteSpace(answer)) throw new JsonException("Empty answer");
                var mentionedTool = ZeroArgumentReadTools.FirstOrDefault(name => answer.Contains(name, StringComparison.Ordinal));
                var fallbackTool = round == 0 ? requiredInitialTool ?? mentionedTool : mentionedTool;
                if (fallbackTool is not null && round < MaxRounds - 1 && !sources.Contains(fallbackTool))
                {
                    calls++;
                    var callId = $"server_forced_{round}_{calls}";
                    messages.Add(JsonSerializer.SerializeToNode(new {
                        role = "assistant", content = (string?)null,
                        tool_calls = new[] { new { id = callId, type = "function", function = new { name = fallbackTool, arguments = "{}" } } }
                    }));
                    var fallbackArguments = round == 0 && fallbackTool == requiredInitialTool
                        ? forcedArguments : JsonSerializer.Deserialize<JsonElement>("{}");
                    var result = await tools.ExecuteAsync(fallbackTool, fallbackArguments, loginId, eventId, deadline.Token);
                    var resultElement = JsonSerializer.SerializeToElement(result);
                    if (!resultElement.TryGetProperty("error", out _)) sources.Add(fallbackTool);
                    messages.Add(JsonSerializer.SerializeToNode(new { role = "tool", tool_call_id = callId, content = JsonSerializer.Serialize(result) }));
                    continue;
                }
                // Internal function names are implementation details and must never be instructions to the user.
                if (ZeroArgumentReadTools.Concat(ArgumentReadTools).Any(name => answer.Contains(name, StringComparison.Ordinal)))
                    throw new JsonException("Provider exposed an internal tool name");
                return new(answer, sources.ToArray(), Usage: Usage());
            }
            if (round == MaxRounds - 1 || toolCalls.GetArrayLength() > MaxToolCalls - calls) throw new JsonException("Tool call limit exceeded");
            messages.Add(JsonNode.Parse(message.GetRawText()));
            foreach (var call in toolCalls.EnumerateArray())
            {
                calls++;
                var name = call.GetProperty("function").GetProperty("name").GetString()!;
                var rawArgs = call.GetProperty("function").GetProperty("arguments").GetString()!;
                object result;
                try
                {
                    if (rawArgs.Length > 12000) throw new JsonException();
                    using var args = JsonDocument.Parse(rawArgs);
                    // Some compatible models wrap an empty argument object as {"properties":{}}.
                    // Read tools below accept no model-controlled scope, so discard that harmless wrapper.
                    var normalizedArgs = round == 0 && name == requiredInitialTool
                        ? forcedArguments
                        : ZeroArgumentReadTools.Contains(name, StringComparer.Ordinal)
                            ? JsonSerializer.Deserialize<JsonElement>("{}")
                            : args.RootElement;
                    result = await tools.ExecuteAsync(name, normalizedArgs, loginId, eventId, deadline.Token);
                    var resultElement = JsonSerializer.SerializeToElement(result);
                    if (result is AssistantActionPreparation proposal)
                        return new("Подготовлено изменение. Проверьте значения в карточке и подтвердите или отмените действие.",
                            sources.ToArray(), [proposal.Action], Usage());
                    // Only successful reads appear as sources in the UI.
                    if (!resultElement.TryGetProperty("error", out _)) sources.Add(name);
                }
                catch (JsonException) { result = new { error = "invalid_arguments" }; }
                messages.Add(JsonSerializer.SerializeToNode(new { role = "tool", tool_call_id = call.GetProperty("id").GetString(), content = JsonSerializer.Serialize(result) }));
            }
        }
        throw new JsonException("No final answer");
    }
}
