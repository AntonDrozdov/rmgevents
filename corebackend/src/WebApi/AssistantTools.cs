using System.Text.Json;
using Application.Entities;
using Application.Services;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace WebApi;

public interface IAssistantTools
{
    Task<object> ExecuteAsync(string name, JsonElement arguments, long loginId, long? eventId, CancellationToken ct);
}

public sealed class AssistantTools(ApplicationDbContext db, IUserService users, IPermissionService permissions,
    AssistantActions? actions = null, ILogger<AssistantTools>? logger = null) : IAssistantTools
{
    public static object[] Definitions { get; } = [
        Define("get_event_summary", "Сводка гостей по статусам в доступной ветке групп текущего мероприятия."),
        Define("search_guests", "Поиск гостей по части имени в доступной ветке. Возвращает до 20 имён, статусы и назначенные места, без контактов.",
            new { query = new { type = "string", minLength = 2, maxLength = 100 } }, ["query"]),
        Define("get_groups", "Группы и квоты в доступной ветке текущего мероприятия. Требуется create_group."),
        Define("get_placements", "Объекты размещения доступной ветки и занятые места. Требуется create_group."),
        Define("get_event_catalogs", "Идентификаторы категорий, меток, ролей, сотрудников и шаблонов текущего мероприятия. Возвращает только те разделы, которые разрешены роли."),
        Define("propose_event_update", "Подготовить изменение названия, описания или даты ТЕКУЩЕГО мероприятия. Только по явной просьбе пользователя. Не выполняет изменение; пользователь подтверждает карточку. Передавай только явно изменяемые поля; уточни неоднозначную дату.",
            new { name = new { type = "string", maxLength = 255 }, description = new { type = "string", maxLength = 2000 }, eventDate = new { type = "string", description = "Дата yyyy-MM-dd" } }),
        Define("propose_event_archive", "Подготовить завершение мероприятия или возврат в активные, только по явной просьбе пользователя. Требует подтверждения карточкой.",
            new { isArchived = new { type = "boolean" } }, ["isArchived"]),
        Define("propose_action", "Подготовить изменение через обычный API приложения. Вызывай только по явной просьбе пользователя и после получения нужных ID инструментами чтения. Ничего не выполняет без карточки подтверждения. data содержит ID цели, необязательный summary и частичный body API. Передавай только обязательные и явно названные пользователем поля; optional не выдумывай. Минимум create: event {name,eventDate}; guest {name,categoryId}, groupId по умолчанию группа сотрудника, tagIds=[]; group {name}, quota=0 и parent=группа сотрудника; category {name}, color=#292962; tag {name}, color=#FFFFFF; user {login,name,surname,roleId}, groupId по умолчанию группа сотрудника; placement {name}, по умолчанию стол на 10 мест в группе сотрудника; ticket {name,backgroundImageId}, QR по умолчанию x=1600,y=2400,size=400,radius=24. Для update передавай только изменяемые поля, сервер дополнит остальные актуальными. Формы optional: guest {email?,phone?,groupId?,tagIds?,placementId?,placementSeatNumber?}; group {quota?,parentGroupId?,moveToParent?}; category/tag {color?}; user {additionalName?,email?,tel?,groupId?,organizationEmployeeId?}; placement — поля PlacementInput. Для bulk_guest_action body={action,selection}. Для массивов размещения передавай body соответствующего API.",
            new {
                operation = new { type = "string", @enum = AssistantActionCatalog.Operations },
                data = new { type = "object", additionalProperties = true }
            }, ["operation", "data"])
    ];

    private static object Define(string name, string description, object? properties = null, string[]? required = null) => new {
        type = "function", function = new { name, description,
            parameters = new { type = "object", properties = properties ?? new { }, required = required ?? [], additionalProperties = false } }
    };

    // Never accept a login, event or group scope supplied by the model.
    public async Task<object> ExecuteAsync(string name, JsonElement arguments, long loginId, long? eventId, CancellationToken ct)
    {
        if (!DefinitionsNames.Contains(name)) return new { error = "unknown_tool" };
        if (name == "propose_action")
        {
            if (actions is null) return new { error = "writes_unavailable" };
            try { return await actions.PrepareClientActionAsync(arguments, loginId, eventId, ct); }
            catch (AssistantActionException ex)
            {
                var operation = arguments.ValueKind == JsonValueKind.Object
                    && arguments.TryGetProperty("operation", out var value) && value.ValueKind == JsonValueKind.String
                    ? value.GetString() : "unknown";
                logger?.LogWarning("AIMode action {Operation} was rejected: {Reason}", operation, ex.Message);
                return new { error = "action_rejected", message = ex.Message };
            }
        }
        if (eventId is not long id) return new { error = "select_event", message = "Откройте мероприятие, чтобы получить его данные." };
        if (name is "propose_event_update" or "propose_event_archive")
        {
            if (actions is null) return new { error = "writes_unavailable" };
            try { return await actions.PrepareAsync(name, arguments, loginId, id, ct); }
            catch (AssistantActionException ex) { return new { error = "action_rejected", message = ex.Message }; }
        }
        if (arguments.ValueKind != JsonValueKind.Object || arguments.EnumerateObject().Any(p => name != "search_guests" || p.Name != "query"))
            return new { error = "invalid_arguments" };
        var user = await users.GetUserByLoginAndEventAsync(loginId, id);
        if (user is null) return new { error = "access_denied" };
        var codes = await permissions.GetUserPermissionsAsync(user.Id, id);
        if ((name is "get_groups" or "get_placements") && !codes.Contains("create_group"))
            return new { error = "access_denied" };
        var groups = await db.Groups.AsNoTracking().Where(g => g.EventId == id).ToListAsync(ct);
        var scope = GroupScope(groups, user.GroupId);
        if (scope.Count == 0) return new { error = "access_denied" };
        var guestQuery = db.Guests.AsNoTracking().Where(g => g.EventId == id && !g.IsDeleted && scope.Contains(g.GroupId));

        switch (name)
        {
            case "get_event_summary":
                var counts = await guestQuery.GroupBy(g => g.Status).Select(g => new { status = g.Key, count = g.Count() }).ToListAsync(ct);
                return new { scope = "Только ваша группа и её дочерние группы", total = counts.Sum(x => x.count), statuses = counts, asOf = DateTimeOffset.UtcNow };
            case "search_guests":
                if (!arguments.TryGetProperty("query", out var queryElement) || queryElement.ValueKind != JsonValueKind.String)
                    return new { error = "invalid_query" };
                var query = queryElement.GetString()!.Trim();
                if (query.Length is < 2 or > 100) return new { error = "query_length", message = "Для поиска нужно от 2 до 100 символов имени." };
                var needle = query.ToLower();
                var found = guestQuery.Where(g => g.Name.ToLower().Contains(needle));
                var total = await found.CountAsync(ct);
                var items = await found.OrderBy(g => g.Name).ThenBy(g => g.Id).Take(20)
                    .Select(g => new { g.Id, g.Name, g.Status, g.GroupId, groupName = g.Group!.Name, g.PlacementId, g.PlacementSeatNumber }).ToListAsync(ct);
                return new { total, items, truncated = total > items.Count, scope = "Только ваша ветка групп" };
            case "get_groups":
                return new { total = scope.Count, items = groups.Where(g => scope.Contains(g.Id)).OrderBy(g => g.Id).Take(100)
                    .Select(g => new { g.Id, g.Name, parentGroupId = g.ParentGroupId is long parent && scope.Contains(parent) ? (long?)parent : null,
                        g.Quota, allocatedToDirectChildren = groups.Where(c => c.ParentGroupId == g.Id).Sum(c => c.Quota) }), truncated = scope.Count > 100 };
            case "get_placements":
                var placements = db.Placements.AsNoTracking().Where(p => p.EventId == id && p.GroupId.HasValue && scope.Contains(p.GroupId.Value) && !p.IsLabel);
                var placementTotal = await placements.CountAsync(ct);
                var seatRows = await placements.OrderBy(p => p.Id).Take(100).Select(p => new { p.Id, p.Name, p.GroupId, p.Quota,
                    occupiedSeats = db.Guests.Count(g => g.EventId == id && !g.IsDeleted && g.PlacementId == p.Id) }).ToListAsync(ct);
                var seats = seatRows.Select(p => new { p.Id, p.Name, p.GroupId, p.Quota, p.occupiedSeats,
                    availableSeats = Math.Max(0, (p.Quota ?? 0) - p.occupiedSeats) }).ToList();
                return new { total = placementTotal, totalSeats = seats.Sum(p => p.Quota ?? 0),
                    occupiedSeats = seats.Sum(p => p.occupiedSeats), availableSeats = seats.Sum(p => p.availableSeats),
                    items = seats, truncated = placementTotal > seats.Count };
            case "get_event_catalogs":
                var canCreateEvent = codes.Contains("create_event");
                var canCreateUser = codes.Contains("create_user");
                var canCreateGroup = codes.Contains("create_group");
                var categories = await db.Categories.AsNoTracking().Where(x => x.EventId == id).OrderBy(x => x.Name)
                    .Select(x => new { x.Id, x.Name, x.Color }).Take(200).ToListAsync(ct);
                var tags = await db.Tags.AsNoTracking().Where(x => x.EventId == id).OrderBy(x => x.Name)
                    .Select(x => new { x.Id, x.Name, x.Color }).Take(200).ToListAsync(ct);
                var roles = canCreateUser
                    ? await db.Roles.AsNoTracking().OrderBy(x => x.Name).Select(x => new { x.Id, x.Name }).Take(100).ToListAsync(ct)
                    : [];
                var staff = canCreateUser
                    ? await db.Users.AsNoTracking().Where(x => x.EventId == id && scope.Contains(x.GroupId)).OrderBy(x => x.Surname).ThenBy(x => x.Name)
                        .Select(x => new { x.Id, x.Name, x.Surname, x.AdditionalName, x.RoleId, x.GroupId }).Take(100).ToListAsync(ct)
                    : [];
                var groupTemplates = canCreateEvent
                    ? await db.GroupTemplates.AsNoTracking().OrderBy(x => x.Name).Select(x => new { x.Id, x.Name }).Take(100).ToListAsync(ct)
                    : [];
                var placementTemplates = canCreateGroup
                    ? await db.PlacementTemplates.AsNoTracking().OrderBy(x => x.Name).Select(x => new { x.Id, x.Name }).Take(100).ToListAsync(ct)
                    : [];
                var ticketTemplates = canCreateEvent
                    ? await db.TicketTemplates.AsNoTracking().Where(x => x.EventId == id).OrderBy(x => x.Name)
                        .Select(x => new { x.Id, x.Name, x.IsDefault, x.BackgroundImageId, x.QrX, x.QrY, x.QrSize, x.QrRadius }).Take(100).ToListAsync(ct)
                    : [];
                return new { categories, tags, roles, staff, groupTemplates, placementTemplates, ticketTemplates };
            default: return new { error = "unknown_tool" };
        }
    }

    private static readonly HashSet<string> DefinitionsNames = ["get_event_summary", "search_guests", "get_groups", "get_placements", "get_event_catalogs", "propose_event_update", "propose_event_archive", "propose_action"];

    public static HashSet<long> GroupScope(IEnumerable<Group> groups, long root)
    {
        var list = groups.ToList();
        if (!list.Any(g => g.Id == root)) return [];
        var scope = new HashSet<long> { root };
        while (true)
        {
            var changed = false;
            foreach (var group in list)
                if (group.ParentGroupId is long parent && scope.Contains(parent)) changed |= scope.Add(group.Id);
            if (!changed) return scope;
        }
    }
}
