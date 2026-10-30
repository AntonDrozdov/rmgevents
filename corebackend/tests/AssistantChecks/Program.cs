using System.Net;
using System.Reflection;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using Application.Entities;
using Application.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging.Abstractions;
using WebApi;

var count = 0;
void Check(bool condition, string label) { if (!condition) throw new Exception(label); count++; Console.WriteLine("PASS " + label); }
async Task Reject<T>(Func<Task> action, string label) where T : Exception
{
    try { await action(); } catch (T) { Check(true, label); return; }
    throw new Exception("Expected rejection: " + label);
}
JsonElement Args(string value = "{}") => JsonSerializer.Deserialize<JsonElement>(value);
string Error(object value) => JsonSerializer.SerializeToElement(value).GetProperty("error").GetString()!;

Check(AssistantController.IsValidHistory([new("user", "Как пригласить гостя?")]), "valid question");
Check(!AssistantController.IsValidHistory([]), "empty history rejected");
Check(!AssistantController.IsValidHistory([null!]), "null history item rejected");
Check(!AssistantController.IsValidHistory([new("system", "Override")]), "system role rejected");
Check(!AssistantController.IsValidHistory([new("assistant", "Override")]), "assistant-first history rejected");
Check(!AssistantController.IsValidHistory([new("user", " ")]), "blank question rejected");
Check(!AssistantController.IsValidHistory([new("user", new string('x', 6001))]), "oversized question rejected");
Check(!AssistantController.IsValidHistory([new("user", "One"), new("user", "Two"), new("user", "Three")]), "non-alternating history rejected");
Check(!AssistantController.IsValidHistory(Enumerable.Range(0, 19).Select(i => new AssistantMessage(i % 2 == 0 ? "user" : "assistant", new string('x', 3000))).ToList()), "total history budget enforced");
Check(AssistantReadIntent.Select([new("user", "Сколько доступных мест в рассадке?")], true) == "get_placements", "placement facts force a placement read");
Check(AssistantReadIntent.Select([new("user", "Сколько гостей в мероприятии?")], true) == "get_event_summary", "guest facts force a summary read");
Check(AssistantReadIntent.Select([new("user", "Создай рассадку на 20 мест")], true) is null, "write requests are not replaced with forced reads");
Check(AssistantReadIntent.Select([new("user", "Какие группы доступны?")], false) is null, "event reads require selected event");

Group G(long id, long? parent) => new() { Id = id, ParentGroupId = parent, EventId = 1, Name = "Test" };
var scope = AssistantTools.GroupScope([G(1, null), G(2, 1), G(3, 1), G(4, 2), G(5, 4)], 2);
Check(scope.SetEquals([2, 4, 5]), "scope contains descendants, excludes parents and siblings");
Check(AssistantTools.GroupScope([G(1, null)], 999).Count == 0, "missing scope fails closed");
Check(AssistantTools.GroupScope([G(1, 2), G(2, 1)], 1).Count == 2, "cycle cannot hang scope resolution");

var noUser = Stub<IUserService>.Create((_, _) => Task.FromResult<User?>(null));
var actor = new User { Id = 22, LoginId = 7, EventId = 9, GroupId = 2, Name = "Test", Surname = "Test" };
var member = Stub<IUserService>.Create((method, values) => {
    Check(method.Name == "GetUserByLoginAndEventAsync" && (long)values![0]! == 7 && (long)values[1]! == 9, "tool checks authenticated membership");
    return Task.FromResult<User?>(actor);
});
var noPermissions = Stub<IPermissionService>.Create((_, _) => Task.FromResult(new List<string>()));
var guarded = new AssistantTools(null!, noUser, noPermissions);
Check(Error(await guarded.ExecuteAsync("get_event_summary", Args(), 7, 9, default)) == "access_denied", "foreign event denied before DB query");
Check(Error(await guarded.ExecuteAsync("search_guests", Args("{\"query\":\"Test\",\"eventId\":123}"), 7, 9, default)) == "invalid_arguments", "model cannot override event scope");
Check(Error(await guarded.ExecuteAsync("delete_guest", Args(), 7, 9, default)) == "unknown_tool", "write and arbitrary tools rejected");
Check(Error(await guarded.ExecuteAsync("search_guests", Args("{\"query\":\"Test\"}"), 7, null, default)) == "select_event", "event selection required");
var restricted = new AssistantTools(null!, member, noPermissions);
Check(Error(await restricted.ExecuteAsync("get_groups", Args(), 7, 9, default)) == "access_denied", "group permissions enforced before DB query");
Check(Error(await restricted.ExecuteAsync("get_placements", Args(), 7, 9, default)) == "access_denied", "placement permissions enforced before DB query");

var allowPermissions = Stub<IPermissionService>.Create((method, _) => method.Name switch
{
    "HasPermissionAsync" or "HasPermissionInAnyEventAsync" => Task.FromResult(true),
    "GetUserPermissionsAsync" => Task.FromResult(new List<string> { "create_guest" }),
    _ => throw new NotSupportedException(method.Name)
});
var catalog = new AssistantActionCatalog(member, allowPermissions);
var guestAction = await catalog.BuildAsync(Args("""{"operation":"create_guest","data":{"summary":"Добавить Иванова в группу 2","body":{"name":"Иванов","groupId":2,"categoryId":3,"tagIds":[]}}}"""), 7, 9);
Check(guestAction.Request.Method == "POST" && guestAction.Request.Path == "/events/9/guests", "catalog selects fixed method and scoped API path");
Check(guestAction.RequiredPermission == "create_guest" && guestAction.Changes.First(x => x.Field == "Что будет сделано").After.Contains("Иванова")
    && guestAction.Changes.Any(x => x.Field == "Имя гостя" && x.After == "Иванов")
    && guestAction.Changes.All(x => !x.After.Contains("/events") && !x.After.Contains("POST ")), "catalog creates a human review without HTTP request details");
var minimalGuest = await catalog.BuildAsync(Args("""{"operation":"create_guest","data":{"body":{"name":"Минимальный гость","categoryId":3}}}"""), 7, 9);
var minimalGuestBody = minimalGuest.Request.Body!.Value;
Check(minimalGuestBody.GetProperty("groupId").GetInt64() == actor.GroupId
    && minimalGuestBody.GetProperty("tagIds").GetArrayLength() == 0
    && !minimalGuestBody.TryGetProperty("email", out _), "guest creation defaults group and tags without inventing optional contacts");
await Reject<AssistantActionException>(() => catalog.BuildAsync(Args("""{"operation":"create_guest","data":{"body":{"name":"Без категории"}}}"""), 7, 9),
    "guest creation requests the missing mandatory category");
var minimalGroup = await catalog.BuildAsync(Args("""{"operation":"create_group","data":{"body":{"name":"Минимальная группа"}}}"""), 7, 9);
Check(minimalGroup.Request.Body!.Value.GetProperty("quota").GetInt32() == 0,
    "group creation needs only a name and defaults quota to zero");
var flatMinimalGroup = await catalog.BuildAsync(Args("""{"operation":"create_group","data":{"name":"Плоский формат Yandex"}}"""), 7, 9);
Check(flatMinimalGroup.Request.Body!.Value.GetProperty("name").GetString() == "Плоский формат Yandex"
    && flatMinimalGroup.Request.Body!.Value.GetProperty("quota").GetInt32() == 0,
    "create actions accept Yandex flat data fields and normalize them into the API body");
var minimalCategory = await catalog.BuildAsync(Args("""{"operation":"create_category","data":{"body":{"name":"Минимальная категория"}}}"""), 7, 9);
Check(minimalCategory.Request.Body!.Value.GetProperty("color").GetString() == "#292962",
    "category creation applies the interface default color");
var minimalTag = await catalog.BuildAsync(Args("""{"operation":"create_tag","data":{"body":{"name":"Минимальная метка"}}}"""), 7, 9);
Check(minimalTag.Request.Body!.Value.GetProperty("color").GetString() == "#FFFFFF",
    "tag creation applies the application default color");
var minimalUser = await catalog.BuildAsync(Args("""{"operation":"create_user","data":{"body":{"login":"new.user","name":"Иван","surname":"Иванов","roleId":4}}}"""), 7, 9);
Check(minimalUser.Request.Body!.Value.GetProperty("groupId").GetInt64() == actor.GroupId
    && minimalUser.Request.Body!.Value.GetProperty("email").ValueKind == JsonValueKind.Null,
    "employee creation defaults the group and leaves optional contacts empty");
var minimalPlacement = await catalog.BuildAsync(Args("""{"operation":"create_placement","data":{"body":{"name":"Стол"}}}"""), 7, 9);
Check(minimalPlacement.Request.Body!.Value.GetProperty("groupId").GetInt64() == actor.GroupId
    && minimalPlacement.Request.Body!.Value.GetProperty("quota").GetInt32() == 10,
    "placement creation applies table defaults and the current group");
var minimalTicket = await catalog.BuildAsync(Args("""{"operation":"create_ticket_template","data":{"body":{"name":"Билет","backgroundImageId":8}}}"""), 7, 9);
Check(minimalTicket.Request.Body!.Value.GetProperty("qrX").GetInt32() == 1600
    && minimalTicket.Request.Body!.Value.GetProperty("qrSize").GetInt32() == 400,
    "ticket creation applies interface QR defaults");
await Reject<AssistantActionException>(() => catalog.BuildAsync(Args("""{"operation":"POST https://evil.invalid","data":{}}"""), 7, 9), "arbitrary operation and URL rejected");
await Reject<AssistantActionException>(() => catalog.BuildAsync(Args("""{"operation":"delete_guest","data":{"guestId":"1/../../users"}}"""), 7, 9), "non-numeric route identifier rejected");

var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
    ["YandexAI:ApiKey"] = "test-key", ["YandexAI:FolderId"] = "test-folder"
}).Build();
Check(AssistantModelCatalog.Prices.Count == 6
    && AssistantModelCatalog.Prices.Select(model => model.CostRank).SequenceEqual(Enumerable.Range(1, 6))
    && AssistantModelCatalog.Prices.First().Id == "aliceai-llm-flash"
    && AssistantModelCatalog.Prices.Last().Id == "aliceai-llm", "model price annotations are complete and ranked");
var modelListProvider = new Handler((request, _, _) =>
{
    Check(request.RequestUri!.AbsoluteUri == "https://ai.api.cloud.yandex.net/v1/models", "models use the official provider endpoint");
    Check(request.Headers.Authorization?.ToString() == "Api-Key test-key", "models use the provider key header");
    Check(request.Headers.GetValues("x-project").Single() == "test-folder", "models use the provider project header");
    return Task.FromResult(Reply("""
        {"object":"list","data":[
          {"id":"emb://test-folder/text-embeddings/latest","object":"model","owned_by":"yandex"},
          {"id":"gpt://test-folder/custom-chat/latest","object":"model","owned_by":"partner"},
          {"id":"gpt://test-folder/deepseek-v4.1-flash/latest","object":"model","owned_by":"deepseek"},
          {"id":"gpt://test-folder/aliceai-llm-flash","object":"model","owned_by":"yandex"}
        ]}
        """));
});
using (var dynamicModels = new YandexModelService(new Factory(modelListProvider), configuration))
{
    var availableModels = await dynamicModels.ListAsync(true, default);
    Check(availableModels.Count == 3 && availableModels[0].Id == "aliceai-llm-flash"
        && availableModels[1].Id == "deepseek-v4.1-flash/latest"
        && availableModels[2].Id == "custom-chat/latest", "live models are filtered to chat models and price-ranked");
    Check(availableModels[0].InputPricePerThousandTokens == 0.10m
        && availableModels[2].InputPricePerThousandTokens is null, "known models receive prices and unknown models remain selectable");
    Check(await dynamicModels.ResolveUriAsync("deepseek-v4.1-flash/latest", default)
        == "gpt://test-folder/deepseek-v4.1-flash/latest", "selected model resolves to the exact provider URI");
    Check(await dynamicModels.ResolveUriAsync("not-returned", default) is null, "models outside the live provider list are rejected");
}
using (var pendingStore = new AssistantActionStore())
{
    var expiredView = new AssistantActionView(new string('A', 48), 9, "Expired", [], DateTimeOffset.UtcNow.AddSeconds(-1));
    pendingStore.Add(new(7, expiredView, "propose_event_update", "snapshot", "name", null, DateOnly.FromDateTime(DateTime.UtcNow), false));
    try { pendingStore.Get(expiredView.Id, 7, 9); throw new Exception("Expired proposal accepted"); }
    catch (AssistantActionException ex) { Check(ex.Status == 410, "expired proposals rejected"); }
}
using (var cacheProvider = new ServiceCollection().AddDistributedMemoryCache().BuildServiceProvider())
using (var firstStore = new AssistantActionStore(cacheProvider.GetRequiredService<IDistributedCache>()))
using (var secondStore = new AssistantActionStore(cacheProvider.GetRequiredService<IDistributedCache>()))
{
    var sharedView = new AssistantActionView(new string('B', 48), 9, "Shared", [new("Action", "No", "Yes")], DateTimeOffset.UtcNow.AddMinutes(10));
    firstStore.Add(new AssistantPendingAction(7, sharedView, "create_guest", "", "", null, default, false)
    {
        RequiredPermission = "create_guest",
        Request = new AssistantClientRequest("POST", "/events/9/guests", Args("{\"name\":\"Test\"}"))
    });
    var restored = secondStore.Get(sharedView.Id, 7, 9);
    Check(restored.Request?.Path == "/events/9/guests" && restored.RequiredPermission == "create_guest", "distributed proposal survives another store instance");
}
using (var cacheProvider = new ServiceCollection().AddDistributedMemoryCache().BuildServiceProvider())
{
    var executions = 0;
    var middleware = new AssistantIdempotencyMiddleware(async context =>
    {
        executions++;
        context.Response.StatusCode = 201;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync("{\"id\":123}");
    });
    async Task<string> ExecuteIdempotent()
    {
        var context = new DefaultHttpContext();
        context.Request.Method = "POST";
        context.Request.Headers["X-Assistant-Action-Id"] = new string('C', 48);
        context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "7")], "test"));
        context.Response.Body = new MemoryStream();
        await middleware.InvokeAsync(context, cacheProvider.GetRequiredService<IDistributedCache>(), NullLogger<AssistantIdempotencyMiddleware>.Instance);
        context.Response.Body.Position = 0;
        return await new StreamReader(context.Response.Body).ReadToEndAsync();
    }
    Check(await ExecuteIdempotent() == "{\"id\":123}" && await ExecuteIdempotent() == "{\"id\":123}" && executions == 1,
        "assistant mutation retries replay the cached API response");
}
object[] initial = [new { role = "system", content = "App only" }, new { role = "user", content = "Count guests" }];
const string selectedModelUri = "gpt://test-folder/deepseek-v4.1-flash";
string Completion(object message) => JsonSerializer.Serialize(new { choices = new[] { new { message } } });
object ToolCall(string name = "get_event_summary", string arguments = "{}") => new { id = "call_1", type = "function", function = new { name, arguments } };
var tools = new ToolStub();
var preview = new AssistantActionView(new string('A', 48), 9, "Rename", [new("Name", "Before", "After")], DateTimeOffset.UtcNow.AddMinutes(10));
var proposalTools = new ToolStub { Prepared = new AssistantActionPreparation("Await confirmation", preview) };
var proposalProvider = new Handler((_, index, _) => {
    Check(index == 0, "proposal response requires no extra model round");
    return Task.FromResult(Reply(Completion(new { role = "assistant", content = "", tool_calls = new[] { ToolCall("propose_event_update", "{\"name\":\"After\"}") } })));
});
var proposedAnswer = await new YandexAssistantClient(new Factory(proposalProvider), configuration, proposalTools).CompleteAsync(initial, 7, 9, selectedModelUri, default);
Check(proposedAnswer.Actions?.Single().Id == preview.Id && proposedAnswer.Sources.Count == 0, "proposals returned as confirmation cards, not executed sources");
var delayedProposalTools = new ToolStub { Prepared = new AssistantActionPreparation("Await confirmation", preview), PrepareOnCall = 4 };
var delayedProposalProvider = new Handler(async (request, index, ct) => {
    using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
    Check(body.RootElement.GetProperty("tool_choice").GetString() == "auto", "dependent reads keep action tools available on round " + (index + 1));
    var call = index < 3 ? ToolCall() : ToolCall("propose_action", "{\"operation\":\"create_guest\",\"data\":{}}");
    return Reply(Completion(new { role = "assistant", content = "", tool_calls = new[] { call } }));
});
var delayedProposal = await new YandexAssistantClient(new Factory(delayedProposalProvider), configuration, delayedProposalTools).CompleteAsync(initial, 7, 9, selectedModelUri, default);
Check(delayedProposal.Actions?.Single().Id == preview.Id && delayedProposalTools.Calls == 4,
    "confirmation card can follow three dependent read rounds");
var handler = new Handler(async (request, index, ct) => {
    Check(request.RequestUri!.AbsoluteUri == "https://ai.api.cloud.yandex.net/v1/chat/completions", "fixed provider endpoint");
    Check(request.Headers.Authorization?.ToString() == "Api-Key test-key", "provider key header");
    Check(request.Headers.GetValues("OpenAI-Project").Single() == "test-folder", "provider project header");
    using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
    Check(body.RootElement.GetProperty("model").GetString() == "gpt://test-folder/deepseek-v4.1-flash", "request-selected model URI");
    if (index == 0) return Reply(Completion(new { role = "assistant", content = (string?)null, tool_calls = new[] { ToolCall() } }));
    var last = body.RootElement.GetProperty("messages").EnumerateArray().Last();
    Check(last.GetProperty("role").GetString() == "tool" && last.GetProperty("tool_call_id").GetString() == "call_1", "tool response linked to call");
    Check(last.GetProperty("content").GetString()!.Contains("42"), "tool result included in follow-up");
    return Reply(Completion(new { role = "assistant", content = "42 guests" }));
});
HttpResponseMessage Reply(string body, HttpStatusCode status = HttpStatusCode.OK) => new(status) { Content = new StringContent(body) };
var result = await new YandexAssistantClient(new Factory(handler), configuration, tools).CompleteAsync(initial, 7, 9, selectedModelUri, default);
Check(result.Answer == "42 guests" && result.Sources.SequenceEqual(["get_event_summary"]), "final answer identifies actual data sources");
Check(tools.Calls == 1 && tools.LoginId == 7 && tools.EventId == 9, "tool uses server identity and event");

var forcedTools = new ToolStub();
var forced = new Handler(async (request, index, ct) => {
    using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
    if (index == 0)
    {
        var choice = body.RootElement.GetProperty("tool_choice");
        Check(choice.GetProperty("function").GetProperty("name").GetString() == "get_placements", "factual read forces the selected provider tool");
        return Reply(Completion(new { role = "assistant", content = "Воспользуйтесь инструментом `get_placements()`." }));
    }
    Check(body.RootElement.GetProperty("messages").EnumerateArray().Last().GetProperty("role").GetString() == "tool",
        "textual tool advice is converted to a server-side tool result");
    return Reply(Completion(new { role = "assistant", content = "Свободно 42 места." }));
});
result = await new YandexAssistantClient(new Factory(forced), configuration, forcedTools)
    .CompleteAsync(initial, 7, 9, selectedModelUri, default, "get_placements");
Check(result.Answer == "Свободно 42 места." && result.Sources.SequenceEqual(["get_placements"]) && forcedTools.Calls == 1,
    "internal tool advice is never returned to the user");

var wrappedArgumentTools = new ToolStub();
var wrappedArguments = new Handler((_, index, _) => Task.FromResult(Reply(index == 0
    ? Completion(new { role = "assistant", content = "", tool_calls = new[] { ToolCall("get_placements", "{\"properties\":{}}") } })
    : Completion(new { role = "assistant", content = "Свободно 42 места." }))));
result = await new YandexAssistantClient(new Factory(wrappedArguments), configuration, wrappedArgumentTools)
    .CompleteAsync(initial, 7, 9, selectedModelUri, default, "get_placements");
Check(result.Sources.SequenceEqual(["get_placements"]) && wrappedArgumentTools.LastArguments == "{}",
    "empty read arguments from compatible models are normalized");

var invalid = new Handler((_, index, _) => Task.FromResult(Reply(index == 0
    ? Completion(new { role = "assistant", content = "", tool_calls = new[] { ToolCall(arguments: "invalid JSON") } })
    : Completion(new { role = "assistant", content = "Please clarify" }))));
result = await new YandexAssistantClient(new Factory(invalid), configuration, tools).CompleteAsync(initial, 7, 9, selectedModelUri, default);
Check(tools.Calls == 1 && result.Sources.Count == 0, "invalid arguments never reach tools");

var deniedTools = new ToolStub { Denied = true };
var denied = new Handler((_, index, _) => Task.FromResult(Reply(index == 0
    ? Completion(new { role = "assistant", content = "", tool_calls = new[] { ToolCall() } })
    : Completion(new { role = "assistant", content = "No access" }))));
result = await new YandexAssistantClient(new Factory(denied), configuration, deniedTools).CompleteAsync(initial, 7, 9, selectedModelUri, default);
Check(result.Sources.Count == 0, "denied tools are not reported as sources");

var excessive = new Handler((_, _, _) => Task.FromResult(Reply(Completion(new { role = "assistant", content = "", tool_calls = Enumerable.Range(0, 9).Select(_ => ToolCall()).ToArray() }))));
await Reject<JsonException>(() => new YandexAssistantClient(new Factory(excessive), configuration, tools).CompleteAsync(initial, 7, 9, selectedModelUri, default), "excessive tool calls rejected");
var endless = new Handler((_, _, _) => Task.FromResult(Reply(Completion(new { role = "assistant", content = "", tool_calls = new[] { ToolCall() } }))));
await Reject<JsonException>(() => new YandexAssistantClient(new Factory(endless), configuration, tools).CompleteAsync(initial, 7, 9, selectedModelUri, default), "tool rounds bounded");
var error = new Handler((_, _, _) => Task.FromResult(Reply("provider private error", HttpStatusCode.Unauthorized)));
await Reject<YandexAssistantException>(() => new YandexAssistantClient(new Factory(error), configuration, tools).CompleteAsync(initial, 7, 9, selectedModelUri, default), "provider error handled");
var empty = new Handler((_, _, _) => Task.FromResult(Reply(Completion(new { role = "assistant", content = "" }))));
await Reject<JsonException>(() => new YandexAssistantClient(new Factory(empty), configuration, tools).CompleteAsync(initial, 7, 9, selectedModelUri, default), "empty answer rejected");
var cancel = new Handler(async (_, _, ct) => { await Task.Delay(5000, ct); return Reply("{}"); });
using var cancellation = new CancellationTokenSource(TimeSpan.FromMilliseconds(40));
await Reject<OperationCanceledException>(() => new YandexAssistantClient(new Factory(cancel), configuration, tools).CompleteAsync(initial, 7, 9, selectedModelUri, cancellation.Token), "cancellation reaches provider");
var noChoices = new Handler((_, _, _) => Task.FromResult(Reply("{\"choices\":[]}")));
await Reject<JsonException>(() => new YandexAssistantClient(new Factory(noChoices), configuration, tools).CompleteAsync(initial, 7, 9, selectedModelUri, default), "missing choices rejected");
var huge = new Handler((_, _, _) => Task.FromResult(Reply(new string('x', 256001))));
await Reject<JsonException>(() => new YandexAssistantClient(new Factory(huge), configuration, tools).CompleteAsync(initial, 7, 9, selectedModelUri, default), "provider output size bounded");

// Exercise the real controller and shared assistant rate policy over an isolated HTTP host.
// This host never starts production Program.cs or connects to an application database.
var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Services.AddControllers().AddApplicationPart(typeof(AssistantController).Assembly);
builder.Services.AddAssistant();
builder.Services.AddSingleton<IYandexModelService>(new ModelServiceStub());
builder.Services.AddAuthentication("test").AddScheme<AuthenticationSchemeOptions, TestAuth>("test", _ => { });
builder.Services.AddAuthorization();
builder.Services.AddSingleton(noUser);
builder.Services.AddSingleton(noPermissions);
builder.Services.AddSingleton(Stub<IEventService>.Create((_, _) => Task.FromResult(new List<Event>())));
builder.Services.AddSingleton<IAssistantTools>(new ToolStub());
await using var app = builder.Build();
app.UseAuthentication(); app.UseAuthorization(); app.UseRateLimiter(); app.MapControllers();
await app.StartAsync();
try
{
    var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
    using var http = new HttpClient { BaseAddress = new Uri(address) };
    async Task<HttpResponseMessage> AskHttp(object payload, string? identity = "7") {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/assistant/ask") { Content = System.Net.Http.Json.JsonContent.Create(payload) };
        if (identity is not null) request.Headers.Add("X-Test-Identity", identity);
        return await http.SendAsync(request);
    }
    var question = new { page = "/dashboard", model = "aliceai-llm-flash", messages = new[] { new { role = "user", content = "Помощь" } } };
    using (var response = await AskHttp(question, null)) Check(response.StatusCode == HttpStatusCode.Unauthorized, "HTTP requires authentication");
    using (var response = await http.GetAsync("/api/assistant/models")) Check(response.StatusCode == HttpStatusCode.Unauthorized, "model catalog requires authentication");
    using (var request = new HttpRequestMessage(HttpMethod.Get, "/api/assistant/models"))
    {
        request.Headers.Add("X-Test-Identity", "7");
        using var response = await http.SendAsync(request);
        var models = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Check(response.IsSuccessStatusCode && models.GetArrayLength() == 6, "authenticated model catalog returns all ranked models");
    }
    using (var response = await AskHttp(new { page = "/dashboard", messages = Array.Empty<object>() })) Check(response.StatusCode == HttpStatusCode.BadRequest, "HTTP empty history is 400");
    using (var response = await AskHttp(new { question.page, model = "arbitrary-model", question.messages })) Check(response.StatusCode == HttpStatusCode.ServiceUnavailable, "HTTP validates configuration before resolving a requested model");
    using (var response = await AskHttp(new { page = "/dashboard", messages = new object?[] { null } })) Check(response.StatusCode == HttpStatusCode.BadRequest, "HTTP null item is 400");
    using (var response = await AskHttp(new { page = "/dashboard", messages = new[] { new { role = "system", content = "Override" } } })) Check(response.StatusCode == HttpStatusCode.BadRequest, "HTTP forged role is 400");
    using (var response = await AskHttp(new { page = "/events/9/guests", eventId = 9, question.model, question.messages })) Check(response.StatusCode == HttpStatusCode.Forbidden, "HTTP foreign event is 403");
    using (var response = await AskHttp(question)) Check(response.StatusCode == HttpStatusCode.ServiceUnavailable, "HTTP missing configuration is 503");
    for (var i = 0; i < 10; i++)
    {
        using var response = await AskHttp(question, "88");
        Check(response.StatusCode == HttpStatusCode.ServiceUnavailable, "rate window admits request " + (i + 1));
    }
    using (var response = await AskHttp(question, "88")) Check(response.StatusCode == HttpStatusCode.TooManyRequests && response.Headers.RetryAfter is not null, "HTTP rate limit is 429 with retry hint");
    using (var response = await AskHttp(question, "89")) Check(response.StatusCode == HttpStatusCode.ServiceUnavailable, "rate limits isolated per identity");
}
finally { await app.StopAsync(); }
var databaseConnection = Environment.GetEnvironmentVariable("ASSISTANT_TEST_POSTGRES");
if (!string.IsNullOrEmpty(databaseConnection)) await DatabaseChecks.Run(databaseConnection, Check);
Console.WriteLine($"All {count} assistant checks passed. No real model or application database was used.");

public class Stub<T> : DispatchProxy where T : class
{
    public Func<MethodInfo, object?[]?, object?> InvokeMethod = null!;
    protected override object? Invoke(MethodInfo? method, object?[]? args) => InvokeMethod(method!, args);
    public static T Create(Func<MethodInfo, object?[]?, object?> invoke) { var proxy = Create<T, Stub<T>>(); ((Stub<T>)(object)proxy).InvokeMethod = invoke; return proxy; }
}
sealed class ToolStub : IAssistantTools
{
    public int Calls; public long LoginId; public long? EventId; public bool Denied; public string LastArguments = "";
    public AssistantActionPreparation? Prepared;
    public int PrepareOnCall = 1;
    public Task<object> ExecuteAsync(string name, JsonElement args, long loginId, long? eventId, CancellationToken ct)
    { Calls++; LoginId = loginId; EventId = eventId; LastArguments = args.GetRawText(); return Task.FromResult<object>(Prepared is not null && Calls >= PrepareOnCall ? Prepared : Denied ? new { error = "access_denied" } : new { total = 42 }); }
}
sealed class Handler(Func<HttpRequestMessage, int, CancellationToken, Task<HttpResponseMessage>> handle) : HttpMessageHandler
{
    private int index;
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) => handle(request, index++, ct);
}
sealed class Factory(HttpMessageHandler handler) : IHttpClientFactory
{
    private readonly HttpClient client = new(handler);
    public HttpClient CreateClient(string name) => client;
}
sealed class ModelServiceStub : IYandexModelService
{
    private static readonly IReadOnlyList<AssistantModelOption> Models = AssistantModelCatalog.Prices
        .Select(item => new AssistantModelOption(item.CostRank, item.Id, item.Name,
            item.InputPricePerThousandTokens, item.OutputPricePerThousandTokens,
            item.Context, item.RecommendedUse, "test"))
        .ToArray();
    public Task<IReadOnlyList<AssistantModelOption>> ListAsync(bool forceRefresh, CancellationToken ct) => Task.FromResult(Models);
    public Task<string?> ResolveUriAsync(string id, CancellationToken ct) => Task.FromResult<string?>(
        Models.Any(item => item.Id == id) ? "gpt://test-folder/" + id : null);
}
sealed class TestAuth(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var id = Request.Headers["X-Test-Identity"].ToString();
        return Task.FromResult(string.IsNullOrEmpty(id) ? AuthenticateResult.NoResult()
            : AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, id)], "test")), "test")));
    }
}
