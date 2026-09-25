using Application.Entities;
using Application.Services;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Infrastructure.Services;

public sealed record PlacementView(long Id, long? ParentId, long? GroupId, string Name, int? Quota, int GuestCount, List<int> OccupiedSeatNumbers, bool DisplayChildrenAsRows = false);
public sealed record PlacementInput(string Name, long? ParentId, long? GroupId, int? Quota, int Count = 1, int StartNumber = 1, bool DisplayChildrenAsRows = false);
public sealed record PlacementGuest(long Id, string Name, string? CategoryName, long GroupId, string GroupName, long? PlacementId, int? SeatNumber);

public sealed class PlacementService(ApplicationDbContext db, IPermissionService permissions, IEventStateGuard guard)
{
    public async Task<T> Transaction<T>(long eventId, Func<Task<T>> action)
    {
        if (db.Database.CurrentTransaction != null) return await action();
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            // Serialize placement/quota mutations within an event, including guest form saves.
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({eventId})");
            var result = await action();
            await tx.CommitAsync();
            return result;
        });
    }

    public async Task CheckAccess(long eventId, long loginId, bool write)
    {
        if (!(await permissions.GetUserGroupInEventAsync(loginId, eventId)).HasValue)
            throw new UnauthorizedAccessException();
        if (write)
        {
            await guard.EnsureActiveAsync(eventId);
            if (!await permissions.HasPermissionAsync(loginId, eventId, "create_group"))
                throw new UnauthorizedAccessException();
        }
    }

    public async Task<List<PlacementView>> List(long eventId)
    {
        var placements = await db.Placements.AsNoTracking().Where(x => x.EventId == eventId).OrderBy(x => x.Id).ToListAsync();
        var occupied = await db.Guests.AsNoTracking()
            .Where(g => g.EventId == eventId && g.PlacementId.HasValue && g.PlacementSeatNumber.HasValue)
            .GroupBy(g => g.PlacementId!.Value)
            .ToDictionaryAsync(g => g.Key, g => g.Select(x => x.PlacementSeatNumber!.Value).ToList());
        var guestCounts = await db.Guests.AsNoTracking().Where(g => g.EventId == eventId && g.PlacementId.HasValue)
            .GroupBy(g => g.PlacementId!.Value).ToDictionaryAsync(g => g.Key, g => g.Count());
        return placements.Select(p => new PlacementView(p.Id, p.ParentId, p.GroupId, p.Name, p.Quota,
            guestCounts.GetValueOrDefault(p.Id), occupied.GetValueOrDefault(p.Id, []), p.DisplayChildrenAsRows)).ToList();
    }

    public async Task<HashSet<long>> GroupScope(long eventId, long groupId)
    {
        var groups = await db.Groups.AsNoTracking().Where(x => x.EventId == eventId).Select(x => new { x.Id, x.ParentGroupId }).ToListAsync();
        if (!groups.Any(x => x.Id == groupId)) throw new InvalidOperationException("Группа не найдена в мероприятии.");
        var ids = new HashSet<long> { groupId };
        while (true)
        {
            var added = false;
            foreach (var g in groups) if (g.ParentGroupId.HasValue && ids.Contains(g.ParentGroupId.Value)) added |= ids.Add(g.Id);
            if (!added) return ids;
        }
    }

    public async Task<int?> ResolveSeat(long eventId, long groupId, long? placementId, long? guestId = null, int? requestedSeatNumber = null)
    {
        if (!placementId.HasValue) return null;
        var p = await db.Placements.AsNoTracking().FirstOrDefaultAsync(x => x.Id == placementId && x.EventId == eventId)
            ?? throw new InvalidOperationException("Объект размещения не найден.");
        if (!p.Quota.HasValue || !p.GroupId.HasValue) throw new InvalidOperationException("Для размещения укажите количество мест и группу.");
        if (!(await GroupScope(eventId, p.GroupId.Value)).Contains(groupId)) throw new InvalidOperationException("Гость должен принадлежать группе объекта или её подгруппе.");
        var occupied = (await db.Guests.AsNoTracking().Where(x => x.PlacementId == p.Id && x.Id != guestId && x.PlacementSeatNumber.HasValue)
            .Select(x => x.PlacementSeatNumber!.Value).ToListAsync()).ToHashSet();
        var seatNumber = requestedSeatNumber;
        if (!seatNumber.HasValue)
            for (var candidate = 1; candidate <= p.Quota; candidate++) if (!occupied.Contains(candidate)) { seatNumber = candidate; break; }
        if (!seatNumber.HasValue) throw new InvalidOperationException("All placement seats are occupied.");
        if (seatNumber < 1 || seatNumber > p.Quota) throw new InvalidOperationException("The specified placement seat does not exist.");
        if (occupied.Contains(seatNumber.Value)) throw new InvalidOperationException("This placement seat is already occupied.");
        return seatNumber;

    }

    public async Task ValidateGroupMove(long eventId, long groupId, long? newParentId)
    {
        var parents = await db.Groups.AsNoTracking().Where(g => g.EventId == eventId).ToDictionaryAsync(g => g.Id, g => g.ParentGroupId);
        parents[groupId] = newParentId;
        var assignments = await (from guest in db.Guests
            join placement in db.Placements on guest.PlacementId equals placement.Id
            where guest.EventId == eventId
            select new { GuestGroup = guest.GroupId, PlacementGroup = placement.GroupId }).ToListAsync();
        foreach (var assignment in assignments)
        {
            long? current = assignment.GuestGroup;
            var seen = new HashSet<long>();
            while (current.HasValue && current != assignment.PlacementGroup && seen.Add(current.Value)) current = parents.GetValueOrDefault(current.Value);
            if (!assignment.PlacementGroup.HasValue || current != assignment.PlacementGroup)
                throw new InvalidOperationException("Перенос группы нарушит размещение гостей. Сначала снимите или измените их размещение.");
        }
    }

    private async Task ValidateInput(long eventId, PlacementInput input, long? id = null)
    {
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 140) throw new InvalidOperationException("Название: от 1 до 140 символов.");
        if (input.Quota < 0) throw new InvalidOperationException("Количество мест не может быть отрицательным.");
        if (!input.GroupId.HasValue) throw new InvalidOperationException("Укажите группу.");
        var scope = await GroupScope(eventId, input.GroupId.Value);
        var all = await db.Placements.AsNoTracking().Where(x => x.EventId == eventId).ToDictionaryAsync(x => x.Id);
        if (input.DisplayChildrenAsRows && input.Quota.HasValue)
            throw new InvalidOperationException("Контейнер рядов не может иметь места.");
        if (input.ParentId.HasValue && all.TryGetValue(input.ParentId.Value, out var directParent) && directParent.DisplayChildrenAsRows
            && (input.DisplayChildrenAsRows || !input.Quota.HasValue || input.Quota <= 0))
            throw new InvalidOperationException("Дочерний объект контейнера рядов должен иметь хотя бы одно место.");
        if (input.DisplayChildrenAsRows && id.HasValue && all.Values.Any(x => x.ParentId == id && (x.DisplayChildrenAsRows || !x.Quota.HasValue || x.Quota <= 0)))
            throw new InvalidOperationException("Все дочерние объекты контейнера рядов должны иметь места.");
        var parent = input.ParentId;
        var visited = new HashSet<long>();
        while (parent.HasValue)
        {
            if (parent == id || !visited.Add(parent.Value)) throw new InvalidOperationException("Нельзя создать цикл в структуре.");
            if (!all.TryGetValue(parent.Value, out var node)) throw new InvalidOperationException("Родительский объект не найден.");
            parent = node.ParentId;
        }
        if (id.HasValue)
        {
            var guestGroups = await db.Guests.Where(g => g.PlacementId == id).Select(g => g.GroupId).ToListAsync();
            if (guestGroups.Count > 0 && (!input.Quota.HasValue || guestGroups.Count > input.Quota))
                throw new InvalidOperationException("Сначала снимите гостей: новое количество мест меньше числа гостей или включено «Без мест».");
            if (guestGroups.Any(g => !scope.Contains(g))) throw new InvalidOperationException("Назначенные гости не входят в новую группу. Сначала снимите их размещение.");
        }
    }

    public Task<List<PlacementView>> Create(long eventId, PlacementInput input) => Transaction(eventId, async () =>
    {
        await ValidateInput(eventId, input);
        if (input.Count < 1 || input.Count > 100 || input.StartNumber < 1 || (long)input.StartNumber + input.Count > int.MaxValue)
            throw new InvalidOperationException("Можно создать от 1 до 100 объектов; начальный номер должен быть положительным.");
        if (input.DisplayChildrenAsRows && input.Count != 1)
            throw new InvalidOperationException("ЗАЛ создаётся одним пустым объектом. Ряды добавляются отдельно.");
        if (input.Count > 1 && $"{input.Name.Trim()} {input.StartNumber + input.Count - 1}".Length > 150)
            throw new InvalidOperationException("Название с номером не должно превышать 150 символов.");
        for (var i = 0; i < input.Count; i++) db.Placements.Add(new Placement
        {
            EventId = eventId, ParentId = input.ParentId, GroupId = input.GroupId, Quota = input.Quota, DisplayChildrenAsRows = input.DisplayChildrenAsRows,
            Name = input.Name.Trim() + (input.Count > 1 ? $" {input.StartNumber + i}" : "")
        });
        await db.SaveChangesAsync();
        return await List(eventId);
    });

    public Task<List<PlacementView>> Update(long eventId, long id, PlacementInput input) => Transaction(eventId, async () =>
    {
        var p = await db.Placements.FirstOrDefaultAsync(x => x.Id == id && x.EventId == eventId) ?? throw new InvalidOperationException("Объект не найден.");
        await ValidateInput(eventId, input, id);
        p.Name = input.Name.Trim(); p.ParentId = input.ParentId; p.GroupId = input.GroupId; p.Quota = input.Quota;
        p.DisplayChildrenAsRows = input.DisplayChildrenAsRows;
        await db.SaveChangesAsync();
        return await List(eventId);
    });

    public async Task<List<PlacementGuest>> Guests(long eventId, long groupId) {
        var scope = await GroupScope(eventId, groupId);
        return await db.Guests.AsNoTracking().Where(g => g.EventId == eventId && scope.Contains(g.GroupId)).OrderBy(g => g.Name)
            .Select(g => new PlacementGuest(g.Id, g.Name, g.GuestCategory == null ? null : g.GuestCategory.Category!.Name, g.GroupId, g.Group!.Name, g.PlacementId, g.PlacementSeatNumber)).ToListAsync();
    }

    public Task<bool> Assign(long eventId, long id, long guestId, bool remove) => Transaction(eventId, async () =>
    {
        if (!await db.Placements.AnyAsync(p => p.Id == id && p.EventId == eventId)) throw new InvalidOperationException("Объект не найден.");
        var guest = await db.Guests.FirstOrDefaultAsync(g => g.Id == guestId && g.EventId == eventId) ?? throw new InvalidOperationException("Гость не найден.");
        if (remove) { if (guest.PlacementId == id) { guest.PlacementId = null; guest.PlacementSeatNumber = null; } }
        else { guest.PlacementSeatNumber = await ResolveSeat(eventId, guest.GroupId, id, guest.Id); guest.PlacementId = id; }
        await db.SaveChangesAsync(); return true;
    });

    public Task<bool> Delete(long eventId, long? id, bool confirmed) => Transaction(eventId, async () =>
    {
        var all = await db.Placements.Where(x => x.EventId == eventId).ToListAsync();
        var ids = id.HasValue ? new HashSet<long> { id.Value } : all.Select(x => x.Id).ToHashSet();
        while (true) { var n = ids.Count; foreach (var p in all) if (p.ParentId.HasValue && ids.Contains(p.ParentId.Value)) ids.Add(p.Id); if (n == ids.Count) break; }
        if (!confirmed && await db.Guests.AnyAsync(g => g.EventId == eventId && g.PlacementId.HasValue && ids.Contains(g.PlacementId.Value)))
            throw new InvalidOperationException("В ветке есть гости. Подтвердите снятие их размещения.");
        await db.Guests.Where(g => g.EventId == eventId && g.PlacementId.HasValue && ids.Contains(g.PlacementId.Value)).ExecuteUpdateAsync(s => s.SetProperty(g => g.PlacementId, (long?)null).SetProperty(g => g.PlacementSeatNumber, (int?)null));
        db.Placements.RemoveRange(all.Where(p => ids.Contains(p.Id)));
        await db.SaveChangesAsync(); return true;
    });

    public async Task<object> Templates() => await db.PlacementTemplates.AsNoTracking().OrderBy(x => x.Name).Select(x => new { x.Id, x.Name, x.CreatedAt }).ToListAsync();

    public Task<bool> SaveTemplate(long eventId, string name) => Transaction(eventId, async () =>
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 150) throw new InvalidOperationException("Укажите название шаблона до 150 символов.");
        var list = await List(eventId);
        if (list.Count == 0) throw new InvalidOperationException("Структура пуста.");
        db.PlacementTemplates.Add(new PlacementTemplate { Name = name.Trim(), CreatedAt = DateTimeOffset.UtcNow,
            Structure = JsonSerializer.Serialize(list.Select(x => x with { GroupId = null, GuestCount = 0, OccupiedSeatNumbers = [] })) });
        await db.SaveChangesAsync(); return true;
    });

    public Task<List<PlacementView>> ApplyTemplate(long eventId, long templateId, bool confirmed) => Transaction(eventId, async () =>
    {
        var template = await db.PlacementTemplates.AsNoTracking().FirstOrDefaultAsync(x => x.Id == templateId) ?? throw new InvalidOperationException("Шаблон не найден.");
        var source = JsonSerializer.Deserialize<List<PlacementView>>(template.Structure) ?? [];
        await Delete(eventId, null, confirmed);
        var map = new Dictionary<long, long>();
        while (map.Count < source.Count)
        {
            var ready = source.Where(x => !map.ContainsKey(x.Id) && (!x.ParentId.HasValue || map.ContainsKey(x.ParentId.Value))).ToList();
            if (ready.Count == 0) throw new InvalidOperationException("Некорректная структура шаблона.");
            foreach (var item in ready)
            {
                var p = new Placement { EventId = eventId, Name = item.Name, Quota = item.Quota, DisplayChildrenAsRows = item.DisplayChildrenAsRows, ParentId = item.ParentId.HasValue ? map[item.ParentId.Value] : null };
                db.Placements.Add(p); await db.SaveChangesAsync(); map[item.Id] = p.Id;
            }
        }
        return await List(eventId);
    });
}
