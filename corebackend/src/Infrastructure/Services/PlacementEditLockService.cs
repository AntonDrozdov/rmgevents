using Application.Entities;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Services;

public sealed record PlacementEditLockView(
    bool IsLocked,
    bool IsOwnedByCurrentUser,
    long? EditorUserId,
    string? EditorName,
    DateTimeOffset? ExpiresAt,
    Guid? Token);

public sealed class PlacementEditLockException(string message) : Exception(message);

public sealed class PlacementEditLockService(ApplicationDbContext db)
{
    private static readonly TimeSpan LeaseDuration = TimeSpan.FromSeconds(40);

    private static string UserName(User user) => string.Join(" ", new[] { user.Surname, user.Name, user.AdditionalName }
        .Where(value => !string.IsNullOrWhiteSpace(value)));

    private Task<User> GetUser(long eventId, long loginId) => db.Users.AsNoTracking()
        .SingleAsync(user => user.EventId == eventId && user.LoginId == loginId);

    private async Task<PlacementEditLockView> View(long eventId, long currentUserId, DateTimeOffset now)
    {
        var editLock = await db.PlacementEditLocks.AsNoTracking().SingleOrDefaultAsync(item => item.EventId == eventId);
        if (editLock is null || editLock.ExpiresAt <= now)
            return new PlacementEditLockView(false, false, null, null, null, null);

        var editorName = await db.Users.AsNoTracking()
            .Where(user => user.Id == editLock.UserId)
            .Select(user => new { user.Surname, user.Name, user.AdditionalName })
            .SingleOrDefaultAsync();
        var name = editorName is null
            ? "Другой пользователь"
            : string.Join(" ", new[] { editorName.Surname, editorName.Name, editorName.AdditionalName }
                .Where(value => !string.IsNullOrWhiteSpace(value)));
        var owned = editLock.UserId == currentUserId;
        return new PlacementEditLockView(true, owned, editLock.UserId, name, editLock.ExpiresAt, owned ? editLock.Token : null);
    }

    private async Task<T> WithEventLock<T>(long eventId, Func<Task<T>> action)
    {
        if (db.Database.CurrentTransaction is not null) return await action();
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync();
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({eventId})");
            var result = await action();
            await transaction.CommitAsync();
            return result;
        });
    }

    public async Task<PlacementEditLockView> Status(long eventId, long loginId)
    {
        var user = await GetUser(eventId, loginId);
        return await View(eventId, user.Id, DateTimeOffset.UtcNow);
    }

    public async Task<PlacementEditLockView> Acquire(long eventId, long loginId) => await WithEventLock(eventId, async () =>
    {
        var user = await GetUser(eventId, loginId);
        var now = DateTimeOffset.UtcNow;
        var editLock = await db.PlacementEditLocks.SingleOrDefaultAsync(item => item.EventId == eventId);
        if (editLock is not null && editLock.ExpiresAt > now && editLock.UserId != user.Id)
            return await View(eventId, user.Id, now);

        if (editLock is null)
        {
            editLock = new PlacementEditLock { EventId = eventId };
            db.PlacementEditLocks.Add(editLock);
        }
        if (editLock.UserId != user.Id || editLock.ExpiresAt <= now || editLock.Token == Guid.Empty)
        {
            editLock.UserId = user.Id;
            editLock.Token = Guid.NewGuid();
            editLock.AcquiredAt = now;
        }
        editLock.ExpiresAt = now.Add(LeaseDuration);
        await db.SaveChangesAsync();
        return new PlacementEditLockView(true, true, user.Id, UserName(user), editLock.ExpiresAt, editLock.Token);
    });

    public async Task<PlacementEditLockView> Heartbeat(long eventId, long loginId, Guid? token) => await WithEventLock(eventId, async () =>
    {
        var user = await GetUser(eventId, loginId);
        var now = DateTimeOffset.UtcNow;
        var editLock = await db.PlacementEditLocks.SingleOrDefaultAsync(item => item.EventId == eventId);
        if (token.HasValue && editLock is not null && editLock.UserId == user.Id && editLock.Token == token && editLock.ExpiresAt > now)
        {
            editLock.ExpiresAt = now.Add(LeaseDuration);
            await db.SaveChangesAsync();
            return new PlacementEditLockView(true, true, user.Id, UserName(user), editLock.ExpiresAt, editLock.Token);
        }
        return await View(eventId, user.Id, now);
    });

    public async Task<PlacementEditLockView> Takeover(long eventId, long loginId) => await WithEventLock(eventId, async () =>
    {
        var user = await GetUser(eventId, loginId);
        var now = DateTimeOffset.UtcNow;
        var editLock = await db.PlacementEditLocks.SingleOrDefaultAsync(item => item.EventId == eventId);
        if (editLock is null)
        {
            editLock = new PlacementEditLock { EventId = eventId };
            db.PlacementEditLocks.Add(editLock);
        }
        editLock.UserId = user.Id;
        editLock.Token = Guid.NewGuid();
        editLock.AcquiredAt = now;
        editLock.ExpiresAt = now.Add(LeaseDuration);
        await db.SaveChangesAsync();
        return new PlacementEditLockView(true, true, user.Id, UserName(user), editLock.ExpiresAt, editLock.Token);
    });

    public async Task<PlacementEditLockView> Release(long eventId, long loginId, Guid? token) => await WithEventLock(eventId, async () =>
    {
        var user = await GetUser(eventId, loginId);
        var editLock = await db.PlacementEditLocks.SingleOrDefaultAsync(item => item.EventId == eventId);
        if (token.HasValue && editLock is not null && editLock.UserId == user.Id && editLock.Token == token)
        {
            db.PlacementEditLocks.Remove(editLock);
            await db.SaveChangesAsync();
        }
        return await View(eventId, user.Id, DateTimeOffset.UtcNow);
    });

    public async Task EnsureOwned(long eventId, long loginId, Guid? token)
    {
        var user = await GetUser(eventId, loginId);
        var now = DateTimeOffset.UtcNow;
        var editLock = await db.PlacementEditLocks.AsNoTracking().SingleOrDefaultAsync(item => item.EventId == eventId);
        if (!token.HasValue || editLock is null || editLock.UserId != user.Id || editLock.Token != token || editLock.ExpiresAt <= now)
            throw new PlacementEditLockException("Редактирование схемы недоступно: блокировка истекла или была перехвачена другим пользователем.");
    }
}
