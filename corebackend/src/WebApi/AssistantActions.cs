using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Application.Entities;
using Application.Services;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.Memory;

namespace WebApi;

public sealed record AssistantChange(string Field, string Before, string After);
public sealed record AssistantActionView(string Id, long? EventId, string Title, IReadOnlyList<AssistantChange> Changes, DateTimeOffset ExpiresAt);
public sealed record AssistantActionPreparation(string Message, [property: JsonIgnore] AssistantActionView Action);
public sealed record AssistantActionResult(string Status, string Message, AssistantClientRequest? Request = null);
public sealed class AssistantActionException(int status, string message) : Exception(message) { public int Status { get; } = status; }

public sealed class AssistantPendingAction(long loginId, AssistantActionView view, string kind, string fingerprint,
    string name, string? description, DateOnly date, bool archived)
{
    public long LoginId { get; } = loginId;
    public AssistantActionView View { get; } = view;
    public string Kind { get; } = kind;
    public string Fingerprint { get; } = fingerprint;
    public string Name { get; } = name;
    public string? Description { get; } = description;
    public DateOnly Date { get; } = date;
    public bool Archived { get; } = archived;
    public string? RequiredPermission { get; init; }
    public AssistantClientRequest? Request { get; init; }
    public int State;
    public AssistantActionResult? Result;
}

// Proposals live for 10 minutes, are bound to the authenticated login and event,
// and are never executable through an LLM tool. A restart expires all proposals.
public sealed class AssistantActionStore(IDistributedCache? distributed = null) : IDisposable
{
    private readonly MemoryCache cache = new(new MemoryCacheOptions { SizeLimit = 1024 });
    private const string Prefix = "rmgevents:assistant:action:";
    private sealed record Snapshot(long LoginId, AssistantActionView View, string Kind, string Fingerprint,
        string Name, string? Description, DateOnly Date, bool Archived, string? RequiredPermission,
        AssistantClientRequest? Request, int State, AssistantActionResult? Result);

    public void Add(AssistantPendingAction action)
    {
        PutMemory(action);
        SaveDistributed(action);
    }

    public void Save(AssistantPendingAction action)
    {
        PutMemory(action);
        SaveDistributed(action);
    }

    public AssistantPendingAction Get(string id, long loginId, long? eventId)
    {
        if (!cache.TryGetValue<AssistantPendingAction>(id, out var action) || action is null)
            action = LoadDistributed(id);
        if (action is null || action.View.ExpiresAt <= DateTimeOffset.UtcNow)
            throw new AssistantActionException(410, "Предложение истекло. Попросите AIMode подготовить изменение заново.");
        if (action.LoginId != loginId || action.View.EventId != eventId)
            throw new AssistantActionException(403, "Нет доступа к этому предложению.");
        return action;
    }

    private void PutMemory(AssistantPendingAction action) => cache.Set(action.View.Id, action,
        new MemoryCacheEntryOptions { AbsoluteExpiration = action.View.ExpiresAt, Size = 1 });

    private void SaveDistributed(AssistantPendingAction action)
    {
        if (distributed is null) return;
        var ttl = action.View.ExpiresAt - DateTimeOffset.UtcNow;
        if (ttl <= TimeSpan.Zero) return;
        var snapshot = new Snapshot(action.LoginId, action.View, action.Kind, action.Fingerprint, action.Name,
            action.Description, action.Date, action.Archived, action.RequiredPermission, action.Request, action.State, action.Result);
        distributed.SetString(Prefix + action.View.Id, JsonSerializer.Serialize(snapshot),
            new DistributedCacheEntryOptions { AbsoluteExpiration = action.View.ExpiresAt });
    }

    private AssistantPendingAction? LoadDistributed(string id)
    {
        if (distributed is null) return null;
        var json = distributed.GetString(Prefix + id);
        if (string.IsNullOrWhiteSpace(json)) return null;
        var snapshot = JsonSerializer.Deserialize<Snapshot>(json);
        if (snapshot is null) return null;
        var action = new AssistantPendingAction(snapshot.LoginId, snapshot.View, snapshot.Kind, snapshot.Fingerprint,
            snapshot.Name, snapshot.Description, snapshot.Date, snapshot.Archived)
        {
            RequiredPermission = snapshot.RequiredPermission,
            Request = snapshot.Request,
            State = snapshot.State,
            Result = snapshot.Result
        };
        PutMemory(action);
        return action;
    }
    public void Dispose() => cache.Dispose();
}

public sealed class AssistantActions(ApplicationDbContext db, IUserService users, IPermissionService permissions,
    IEventService events, AssistantActionStore store, IEventLogService audit, AssistantActionCatalog catalog)
{
    public async Task<AssistantActionPreparation> PrepareAsync(string kind, JsonElement args, long loginId, long eventId, CancellationToken ct)
    {
        await CheckAccess(loginId, eventId);
        var item = await db.Events.AsNoTracking().SingleOrDefaultAsync(e => e.Id == eventId, ct)
            ?? throw new AssistantActionException(404, "Мероприятие не найдено.");
        if (args.ValueKind != JsonValueKind.Object) throw new AssistantActionException(400, "Некорректные параметры.");
        var allowed = kind == "propose_event_update" ? new[] { "name", "description", "eventDate" } : new[] { "isArchived" };
        if (args.EnumerateObject().Any(p => !allowed.Contains(p.Name))) throw new AssistantActionException(400, "Недопустимые параметры изменения.");
        var name = item.Name;
        var description = item.Description;
        var date = item.EventDate;
        var archived = item.IsArchived;
        var changes = new List<AssistantChange>();
        if (kind == "propose_event_update")
        {
            if (item.IsArchived) throw new AssistantActionException(409, "Мероприятие завершено. Сначала верните его в активные.");
            if (args.TryGetProperty("name", out var value))
            {
                if (value.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(value.GetString()) || value.GetString()!.Trim().Length > 255)
                    throw new AssistantActionException(400, "Название должно содержать от 1 до 255 символов.");
                name = value.GetString()!.Trim();
            }
            if (args.TryGetProperty("description", out value))
            {
                if (value.ValueKind is not (JsonValueKind.String or JsonValueKind.Null)) throw new AssistantActionException(400, "Некорректное описание.");
                description = value.GetString()?.Trim();
                if (description?.Length > 2000) throw new AssistantActionException(400, "Описание не должно превышать 2000 символов.");
                if (string.IsNullOrWhiteSpace(description)) description = null;
            }
            if (args.TryGetProperty("eventDate", out value))
            {
                if (value.ValueKind != JsonValueKind.String || !DateOnly.TryParseExact(value.GetString(), "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out date) || date == default)
                    throw new AssistantActionException(400, "Дата должна быть в формате ГГГГ-ММ-ДД.");
            }
            if (name != item.Name) changes.Add(new("Название", item.Name, name));
            if (description != item.Description) changes.Add(new("Описание", item.Description ?? "—", description ?? "—"));
            if (date != item.EventDate) changes.Add(new("Дата", item.EventDate.ToString("dd.MM.yyyy"), date.ToString("dd.MM.yyyy")));
        }
        else if (kind == "propose_event_archive")
        {
            if (!args.TryGetProperty("isArchived", out var value) || value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                throw new AssistantActionException(400, "Укажите статус мероприятия.");
            archived = value.GetBoolean();
            if (archived != item.IsArchived) changes.Add(new("Статус", item.IsArchived ? "Завершено" : "Активно", archived ? "Завершено" : "Активно"));
        }
        else throw new AssistantActionException(400, "Неизвестное действие.");
        if (changes.Count == 0) throw new AssistantActionException(409, "Изменений нет: эти значения уже установлены.");
        var view = new AssistantActionView(Convert.ToHexString(RandomNumberGenerator.GetBytes(24)), eventId,
            $"Изменить мероприятие «{item.Name}»", changes, DateTimeOffset.UtcNow.AddMinutes(10));
        store.Add(new(loginId, view, kind, Fingerprint(item), name, description, date, archived));
        return new("Изменения подготовлены, но ещё не выполнены. Требуется подтверждение кнопкой в карточке.", view);
    }

    public async Task<AssistantActionPreparation> PrepareClientActionAsync(JsonElement args, long loginId, long? eventId, CancellationToken ct)
    {
        var action = await catalog.BuildAsync(args, loginId, eventId, ct);
        var view = new AssistantActionView(Convert.ToHexString(RandomNumberGenerator.GetBytes(24)), eventId,
            action.Title, action.Changes, DateTimeOffset.UtcNow.AddMinutes(10));
        store.Add(new(loginId, view, action.Operation, "", "", null, default, false)
        {
            RequiredPermission = action.RequiredPermission,
            Request = action.Request
        });
        return new("Действие подготовлено, но ещё не выполнено. Проверьте карточку и подтвердите его кнопкой.", view);
    }

    public async Task<AssistantActionResult> DecideAsync(string id, long loginId, long? eventId, bool confirm, CancellationToken ct)
    {
        var pending = store.Get(id, loginId, eventId);
        if (pending.Request is not null)
            await catalog.RecheckAsync(loginId, eventId, pending.Kind, pending.RequiredPermission);
        else if (eventId is long currentEventId)
            await CheckAccess(loginId, currentEventId); // Recheck even for retry; permission may have been revoked.
        else
            throw new AssistantActionException(400, "Для изменения мероприятия не указан его идентификатор.");
        if (Interlocked.CompareExchange(ref pending.State, 1, 0) != 0)
            return pending.Result ?? throw new AssistantActionException(409, "Действие уже выполняется. Повторите проверку через несколько секунд.");
        if (!confirm)
        {
            pending.Result = new("cancelled", "Изменение отменено.");
            store.Save(pending);
            return pending.Result;
        }
        if (pending.Request is not null)
        {
            pending.Result = new("approved", "Права проверены. Действие передано обычному API приложения для выполнения.", pending.Request);
            store.Save(pending);
            return pending.Result;
        }
        try
        {
            return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                await using var transaction = await db.Database.BeginTransactionAsync(ct);
                var currentEventId = eventId!.Value;
                var item = await db.Events.FromSqlInterpolated($"SELECT * FROM corebackend.events WHERE id = {currentEventId} FOR UPDATE")
                    .AsNoTracking().SingleOrDefaultAsync(ct) ?? throw new AssistantActionException(404, "Мероприятие не найдено.");
                if (Fingerprint(item) != pending.Fingerprint)
                    throw new AssistantActionException(409, "Данные мероприятия изменились. Подготовьте новое предложение и проверьте его.");
                // Remove any tracked copy loaded while building context. Services load the locked current state.
                db.ChangeTracker.Clear();
                await CheckAccess(loginId, currentEventId);
                if (pending.Kind == "propose_event_update")
                    await events.UpdateEventAsync(currentEventId, loginId, pending.Name, pending.Description, pending.Date, item.LogoImageId);
                else await events.UpdateEventArchiveStatusAsync(currentEventId, loginId, pending.Archived);
                await audit.AddAsync(currentEventId, loginId, "assistant_updated", "Event", currentEventId,
                    "AIMode: подтверждено изменение мероприятия", string.Join(", ", pending.View.Changes.Select(c => c.Field)));
                await transaction.CommitAsync(CancellationToken.None);
                pending.Result = new("completed", "Изменения сохранены. Обновите страницу, чтобы увидеть актуальные данные.");
                store.Save(pending);
                return pending.Result;
            });
        }
        catch
        {
            pending.Result = new("failed", "Изменение не подтверждено как выполненное. Проверьте данные мероприятия перед новым запросом.");
            store.Save(pending);
            throw;
        }
    }

    private async Task CheckAccess(long loginId, long eventId)
    {
        var user = await users.GetUserByLoginAndEventAsync(loginId, eventId);
        if (user is null || !(await permissions.GetUserPermissionsAsync(user.Id, eventId)).Contains("create_event"))
            throw new AssistantActionException(403, "Для изменения мероприятия требуется разрешение create_event в этом мероприятии.");
    }
    private static string Fingerprint(Event item) => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(
        new { item.Id, item.Name, item.Description, item.EventDate, item.LogoImageId, item.IsArchived })));
}
