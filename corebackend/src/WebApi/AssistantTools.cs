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
        Define("list_guests", "Список гостей по именам в доступной ветке групп. Возвращает до 100 гостей, отсортированных по имени, без контактных данных."),
        Define("search_guests", "Поиск гостей по части имени в доступной ветке. Возвращает до 20 имён, статусы и назначенные места, без контактов.",
            new { query = new { type = "string", minLength = 2, maxLength = 100 } }, ["query"]),
        Define("get_guest_neighbors", "Найти гостя по имени и определить, кто сидит на соседних местах. Для ряда соседями считаются места слева и справа, для стола также замыкаются первое и последнее места. Возвращает свободные соседние номера без контактов.",
            new { query = new { type = "string", minLength = 2, maxLength = 100 } }, ["query"]),
        Define("get_groups", "Группы и квоты в доступной ветке текущего мероприятия. Требуется create_group."),
        Define("get_placements", "Объекты размещения доступной ветки, их занятые и свободные номера мест. Используй вместе с search_guests для точной пересадки гостя. Требуется create_group или create_guest."),
        Define("get_event_catalogs", "Идентификаторы категорий, меток, ролей, сотрудников и шаблонов текущего мероприятия. Возвращает только те разделы, которые разрешены роли."),
        Define("search_guests_across_events", "Найти гостя по части имени во ВСЕХ доступных пользователю мероприятиях. Используй для вопросов «в каких мероприятиях был или участвовал гость». Сервер сам проверяет доступ к каждому мероприятию и ограничивает результат веткой групп пользователя.",
            new { query = new { type = "string", minLength = 2, maxLength = 100 } }, ["query"]),
        Define("list_staff", "Список сотрудников текущего мероприятия из доступной ветки групп, с ролями и группами. Доступно только при праве create_user."),
        Define("search_staff", "Поиск сотрудника текущего мероприятия по части имени. Возвращает роль и группу, без контактов. Доступно только при праве create_user.",
            new { query = new { type = "string", minLength = 2, maxLength = 100 } }, ["query"]),
        Define("get_staff_summary", "Статистика сотрудников текущего мероприятия: общее число и разбивка по ролям и группам. Доступно только при праве create_user."),
        Define("search_staff_across_events", "Найти сотрудника по части имени во ВСЕХ доступных пользователю мероприятиях. Используй для вопросов «в каких мероприятиях был этот сотрудник». Сервер включает только мероприятия, где у текущего пользователя есть право create_user, и доступную ему ветку групп.",
            new { query = new { type = "string", minLength = 2, maxLength = 100 } }, ["query"]),
        Define("propose_event_update", "Подготовить изменение названия, описания или даты ТЕКУЩЕГО мероприятия. Только по явной просьбе пользователя. Не выполняет изменение; пользователь подтверждает карточку. Передавай только явно изменяемые поля; уточни неоднозначную дату.",
            new { name = new { type = "string", maxLength = 255 }, description = new { type = "string", maxLength = 2000 }, eventDate = new { type = "string", description = "Дата yyyy-MM-dd" } }),
        Define("propose_event_archive", "Подготовить завершение мероприятия или возврат в активные, только по явной просьбе пользователя. Требует подтверждения карточкой.",
            new { isArchived = new { type = "boolean" } }, ["isArchived"]),
        Define("propose_action", "Подготовить изменение через обычный API приложения. Вызывай только по явной просьбе пользователя и после получения нужных ID инструментами чтения. Ничего не выполняет без карточки подтверждения. data содержит ID цели, необязательный summary и частичный body API. Передавай только обязательные и явно названные пользователем поля; optional не выдумывай. Для точной посадки или пересадки гостя используй operation=reseat_guest и data={guestId,placementId,seatNumber}; сначала найди гостя через search_guests и свободный номер через get_placements. Не используй assign_guest_seat, когда пользователь просит конкретное или другое место. Минимум create: event {name,eventDate}; guest {name,categoryId}, groupId по умолчанию группа сотрудника, tagIds=[]; group {name}, quota=0 и parent=группа сотрудника; category {name}, color=#292962; tag {name}, color=#FFFFFF; user {login,name,surname,roleId}, groupId по умолчанию группа сотрудника; placement {name}, по умолчанию стол на 10 мест в группе сотрудника; ticket {name,backgroundImageId}, QR по умолчанию x=1600,y=2400,size=400,radius=24. Для update передавай только изменяемые поля, сервер дополнит остальные актуальными. Формы optional: guest {email?,phone?,groupId?,tagIds?,placementId?,placementSeatNumber?}; group {quota?,parentGroupId?,moveToParent?}; category/tag {color?}; user {additionalName?,email?,tel?,groupId?,organizationEmployeeId?}; placement — поля PlacementInput. Для bulk_guest_action body={action,selection}. Для массивов размещения передавай body соответствующего API.",
            new {
                operation = new { type = "string", @enum = AssistantActionCatalog.Operations },
                data = new { type = "object", additionalProperties = true }
            }, ["operation", "data"]),
        Define("propose_actions", "Подготовить ЕДИНУЮ карточку для нескольких изменений. Используй, когда пользователь одной командой просит создать или изменить 2–25 объектов: гостей, групп, категорий, меток или объектов размещения. Каждая запись имеет ту же форму operation/data, что propose_action. Не вызывай propose_action отдельно для каждого объекта.",
            new {
                title = new { type = "string", maxLength = 200 },
                actions = new {
                    type = "array", minItems = 2, maxItems = 25,
                    items = new {
                        type = "object",
                        properties = new {
                            operation = new { type = "string", @enum = AssistantActionCatalog.Operations },
                            data = new { type = "object", additionalProperties = true }
                        },
                        required = new[] { "operation", "data" }, additionalProperties = false
                    }
                }
            }, ["actions"])
    ];

    private static object Define(string name, string description, object? properties = null, string[]? required = null) => new {
        type = "function", function = new { name, description,
            parameters = new { type = "object", properties = properties ?? new { }, required = required ?? [], additionalProperties = false } }
    };

    // Never accept a login, event or group scope supplied by the model.
    public async Task<object> ExecuteAsync(string name, JsonElement arguments, long loginId, long? eventId, CancellationToken ct)
    {
        if (!DefinitionsNames.Contains(name)) return new { error = "unknown_tool" };
        if (name is "propose_action" or "propose_actions")
        {
            if (actions is null) return new { error = "writes_unavailable" };
            try
            {
                return name == "propose_actions"
                    ? await actions.PrepareClientActionsAsync(arguments, loginId, eventId, ct)
                    : await actions.PrepareClientActionAsync(arguments, loginId, eventId, ct);
            }
            catch (AssistantActionException ex)
            {
                var operation = name == "propose_actions" ? "batch" : arguments.ValueKind == JsonValueKind.Object
                    && arguments.TryGetProperty("operation", out var value) && value.ValueKind == JsonValueKind.String
                    ? value.GetString() : "unknown";
                logger?.LogWarning("AIMode action {Operation} was rejected: {Reason}", operation, ex.Message);
                return new { error = "action_rejected", message = ex.Message };
            }
        }
        if (name == "search_guests_across_events")
            return await SearchGuestsAcrossEventsAsync(arguments, loginId, ct);
        if (name == "search_staff_across_events")
            return await SearchStaffAcrossEventsAsync(arguments, loginId, ct);
        if (eventId is not long id) return new { error = "select_event", message = "Откройте мероприятие, чтобы получить его данные." };
        if (name is "propose_event_update" or "propose_event_archive")
        {
            if (actions is null) return new { error = "writes_unavailable" };
            try { return await actions.PrepareAsync(name, arguments, loginId, id, ct); }
            catch (AssistantActionException ex) { return new { error = "action_rejected", message = ex.Message }; }
        }
        if (arguments.ValueKind != JsonValueKind.Object || arguments.EnumerateObject().Any(p => name is not ("search_guests" or "get_guest_neighbors" or "search_staff") || p.Name != "query"))
            return new { error = "invalid_arguments" };
        var user = await users.GetUserByLoginAndEventAsync(loginId, id);
        if (user is null) return new { error = "access_denied" };
        var codes = await permissions.GetUserPermissionsAsync(user.Id, id);
        if (name == "get_groups" && !codes.Contains("create_group"))
            return new { error = "access_denied" };
        if (name == "get_placements" && !codes.Contains("create_group") && !codes.Contains("create_guest"))
            return new { error = "access_denied" };
        if (name is "list_staff" or "search_staff" or "get_staff_summary" && !codes.Contains("create_user"))
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
            case "list_guests":
                var guestTotal = await guestQuery.CountAsync(ct);
                var guests = await guestQuery.OrderBy(g => g.Name).ThenBy(g => g.Id).Take(100)
                    .Select(g => new { g.Id, g.Name, g.Status, g.GroupId, groupName = g.Group!.Name, g.PlacementId, g.PlacementSeatNumber }).ToListAsync(ct);
                return new { total = guestTotal, items = guests, truncated = guestTotal > guests.Count, scope = "Только ваша ветка групп" };
            case "search_guests":
                if (!arguments.TryGetProperty("query", out var queryElement) || queryElement.ValueKind != JsonValueKind.String)
                    return new { error = "invalid_query" };
                var query = queryElement.GetString()!.Trim();
                if (query.Length is < 2 or > 100) return new { error = "query_length", message = "Для поиска нужно от 2 до 100 символов имени." };
                var needle = NormalizeNameQuery(query);
                var found = guestQuery.Where(g => g.Name.ToLower().Contains(needle));
                var total = await found.CountAsync(ct);
                var items = await found.OrderBy(g => g.Name).ThenBy(g => g.Id).Take(20)
                    .Select(g => new { g.Id, g.Name, g.Status, g.GroupId, groupName = g.Group!.Name, g.PlacementId, g.PlacementSeatNumber }).ToListAsync(ct);
                return new { total, items, truncated = total > items.Count, scope = "Только ваша ветка групп" };
            case "get_guest_neighbors":
            {
                if (!arguments.TryGetProperty("query", out var neighborQueryElement) || neighborQueryElement.ValueKind != JsonValueKind.String)
                    return new { error = "invalid_query" };
                var neighborQuery = neighborQueryElement.GetString()!.Trim();
                if (neighborQuery.Length is < 2 or > 100) return new { error = "query_length", message = "Для поиска нужно от 2 до 100 символов имени." };
                var neighborNeedle = NormalizeNameQuery(neighborQuery);
                var matchedGuests = await guestQuery.Where(g => g.Name.ToLower().Contains(neighborNeedle)).OrderBy(g => g.Name).ThenBy(g => g.Id).Take(21)
                    .Select(g => new { g.Id, g.Name, g.Status, g.GroupId, groupName = g.Group!.Name, g.PlacementId, g.PlacementSeatNumber }).ToListAsync(ct);
                if (matchedGuests.Count != 1)
                    return new { total = matchedGuests.Count, ambiguous = matchedGuests.Count > 1,
                        matches = matchedGuests.Take(20), message = matchedGuests.Count == 0 ? "Гость не найден в доступной ветке групп." : "Найдено несколько гостей. Уточните имя." };

                var target = matchedGuests[0];
                if (!target.PlacementId.HasValue || !target.PlacementSeatNumber.HasValue)
                    return new { total = 1, target, seated = false, message = "Гость пока не размещён на конкретном месте." };
                var targetPlacement = await db.Placements.AsNoTracking().Where(p => p.Id == target.PlacementId.Value && p.EventId == id
                        && p.GroupId.HasValue && scope.Contains(p.GroupId.Value) && !p.IsLabel && p.Quota.HasValue)
                    .Select(p => new { p.Id, p.Name, p.GroupId, quota = p.Quota!.Value, p.IsRow, p.SeatStartNumber }).SingleOrDefaultAsync(ct);
                if (targetPlacement is null)
                    return new { total = 1, target, seated = false, message = "Объект размещения недоступен в вашей ветке групп." };

                var firstSeat = targetPlacement.SeatStartNumber;
                var lastSeat = firstSeat + targetPlacement.quota - 1;
                var currentSeat = target.PlacementSeatNumber.Value;
                int[] adjacentSeatNumbers;
                if (targetPlacement.quota <= 1) adjacentSeatNumbers = [];
                else if (targetPlacement.IsRow)
                    adjacentSeatNumbers = new[] { currentSeat - 1, currentSeat + 1 }.Where(x => x >= firstSeat && x <= lastSeat).Distinct().ToArray();
                else
                    adjacentSeatNumbers = new[] {
                        currentSeat == firstSeat ? lastSeat : currentSeat - 1,
                        currentSeat == lastSeat ? firstSeat : currentSeat + 1
                    }.Distinct().ToArray();
                var adjacentGuests = await guestQuery.Where(g => g.PlacementId == targetPlacement.Id && g.PlacementSeatNumber.HasValue
                        && adjacentSeatNumbers.Contains(g.PlacementSeatNumber.Value))
                    .OrderBy(g => g.PlacementSeatNumber).Select(g => new { g.Id, g.Name, seatNumber = g.PlacementSeatNumber!.Value }).ToListAsync(ct);
                var occupiedAdjacent = adjacentGuests.Select(x => x.seatNumber).ToHashSet();
                var adjacentSeats = adjacentSeatNumbers.Order().Select(seatNumber => new {
                    seatNumber,
                    isFree = !occupiedAdjacent.Contains(seatNumber),
                    guest = adjacentGuests.Where(x => x.seatNumber == seatNumber).Select(x => new { x.Id, x.Name }).SingleOrDefault()
                }).ToList();
                return new { total = 1, target, seated = true, placement = targetPlacement, adjacentSeats,
                    availableAdjacentSeatNumbers = adjacentSeats.Where(x => x.isFree).Select(x => x.seatNumber).ToArray(), scope = "Только ваша ветка групп" };
            }
            case "get_groups":
                return new { total = scope.Count, items = groups.Where(g => scope.Contains(g.Id)).OrderBy(g => g.Id).Take(100)
                    .Select(g => new { g.Id, g.Name, parentGroupId = g.ParentGroupId is long parent && scope.Contains(parent) ? (long?)parent : null,
                        g.Quota, allocatedToDirectChildren = groups.Where(c => c.ParentGroupId == g.Id).Sum(c => c.Quota) }), truncated = scope.Count > 100 };
            case "get_placements":
                var placements = db.Placements.AsNoTracking().Where(p => p.EventId == id && p.GroupId.HasValue && scope.Contains(p.GroupId.Value) && !p.IsLabel);
                var placementTotal = await placements.CountAsync(ct);
                var seatRows = await placements.OrderBy(p => p.Id).Take(100).Select(p => new { p.Id, p.Name, p.GroupId, p.Quota, p.SeatStartNumber,
                    occupiedSeats = db.Guests.Count(g => g.EventId == id && !g.IsDeleted && g.PlacementId == p.Id) }).ToListAsync(ct);
                var visiblePlacementIds = seatRows.Select(x => x.Id).ToArray();
                var occupiedSeatRows = await guestQuery.Where(g => g.PlacementId.HasValue && visiblePlacementIds.Contains(g.PlacementId.Value)
                        && g.PlacementSeatNumber.HasValue)
                    .Select(g => new { placementId = g.PlacementId!.Value, seatNumber = g.PlacementSeatNumber!.Value }).ToListAsync(ct);
                var seats = seatRows.Select(p => {
                    var occupiedSeatNumbers = occupiedSeatRows.Where(x => x.placementId == p.Id).Select(x => x.seatNumber).Distinct().Order().ToArray();
                    var occupiedSet = occupiedSeatNumbers.ToHashSet();
                    var availableSeatNumbers = p.Quota is > 0
                        ? Enumerable.Range(p.SeatStartNumber, p.Quota.Value).Where(x => !occupiedSet.Contains(x)).ToArray()
                        : [];
                    return new { p.Id, p.Name, p.GroupId, p.Quota, p.SeatStartNumber, p.occupiedSeats,
                        availableSeats = availableSeatNumbers.Length, occupiedSeatNumbers, availableSeatNumbers };
                }).ToList();
                return new { total = placementTotal, totalSeats = seats.Sum(p => p.Quota ?? 0),
                    occupiedSeats = seats.Sum(p => p.occupiedSeats), availableSeats = seats.Sum(p => p.availableSeats),
                    items = seats, truncated = placementTotal > seats.Count };
            case "list_staff":
                var staffTotal = await db.Users.AsNoTracking().CountAsync(x => x.EventId == id && scope.Contains(x.GroupId), ct);
                var staffItems = await db.Users.AsNoTracking().Where(x => x.EventId == id && scope.Contains(x.GroupId))
                    .OrderBy(x => x.Surname).ThenBy(x => x.Name).ThenBy(x => x.Id).Take(100)
                    .Select(x => new { x.Id, x.Name, x.Surname, x.AdditionalName, role = x.Role!.Name, x.GroupId, groupName = x.Group!.Name })
                    .ToListAsync(ct);
                return new { total = staffTotal, items = staffItems, truncated = staffTotal > staffItems.Count, scope = "Только ваша ветка групп" };
            case "search_staff":
                if (!arguments.TryGetProperty("query", out var staffQueryElement) || staffQueryElement.ValueKind != JsonValueKind.String)
                    return new { error = "invalid_query" };
                var staffQuery = staffQueryElement.GetString()!.Trim();
                if (staffQuery.Length is < 2 or > 100) return new { error = "query_length", message = "Для поиска нужно от 2 до 100 символов имени." };
                var staffNeedle = NormalizeNameQuery(staffQuery);
                var staffFound = db.Users.AsNoTracking().Where(x => x.EventId == id && scope.Contains(x.GroupId)
                    && ((x.Name + " " + x.Surname + " " + (x.AdditionalName ?? "")).ToLower().Contains(staffNeedle)));
                var staffFoundTotal = await staffFound.CountAsync(ct);
                var staffMatches = await staffFound.OrderBy(x => x.Surname).ThenBy(x => x.Name).ThenBy(x => x.Id).Take(20)
                    .Select(x => new { x.Id, x.Name, x.Surname, x.AdditionalName, role = x.Role!.Name, x.GroupId, groupName = x.Group!.Name })
                    .ToListAsync(ct);
                return new { total = staffFoundTotal, items = staffMatches, truncated = staffFoundTotal > staffMatches.Count, scope = "Только ваша ветка групп" };
            case "get_staff_summary":
                var staffScope = db.Users.AsNoTracking().Where(x => x.EventId == id && scope.Contains(x.GroupId));
                var totalStaff = await staffScope.CountAsync(ct);
                var byRole = await staffScope.GroupBy(x => x.Role!.Name).OrderBy(x => x.Key)
                    .Select(x => new { role = x.Key, count = x.Count() }).ToListAsync(ct);
                var byGroup = await staffScope.GroupBy(x => new { x.GroupId, groupName = x.Group!.Name }).OrderBy(x => x.Key.groupName)
                    .Select(x => new { x.Key.GroupId, x.Key.groupName, count = x.Count() }).ToListAsync(ct);
                return new { total = totalStaff, byRole, byGroup, scope = "Только ваша ветка групп" };
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

    private async Task<object> SearchGuestsAcrossEventsAsync(JsonElement arguments, long loginId, CancellationToken ct)
    {
        var query = ReadQuery(arguments);
        if (query is null) return new { error = "invalid_query", message = "Для поиска нужно от 2 до 100 символов имени." };
        var needle = NormalizeNameQuery(query);
        var memberships = await db.Users.AsNoTracking().Where(x => x.LoginId == loginId)
            .Select(x => new { x.EventId, x.GroupId }).ToListAsync(ct);
        var eventNames = await db.Events.AsNoTracking().Where(x => memberships.Select(m => m.EventId).Contains(x.Id))
            .Select(x => new { x.Id, x.Name, x.EventDate, x.IsArchived }).ToDictionaryAsync(x => x.Id, ct);
        var matchesByEvent = new List<object>();
        var totalMatches = 0;
        foreach (var membership in memberships)
        {
            if (!eventNames.TryGetValue(membership.EventId, out var item)) continue;
            var groups = await db.Groups.AsNoTracking().Where(x => x.EventId == membership.EventId).ToListAsync(ct);
            var scope = GroupScope(groups, membership.GroupId);
            if (scope.Count == 0) continue;
            var found = db.Guests.AsNoTracking().Where(x => x.EventId == membership.EventId && !x.IsDeleted
                && scope.Contains(x.GroupId) && x.Name.ToLower().Contains(needle));
            var total = await found.CountAsync(ct);
            if (total == 0) continue;
            var guests = await found.OrderBy(x => x.Name).ThenBy(x => x.Id).Take(20)
                .Select(x => new { x.Id, x.Name, x.Status, x.GroupId, groupName = x.Group!.Name }).ToListAsync(ct);
            totalMatches += total;
            matchesByEvent.Add(new { eventId = item.Id, eventName = item.Name, item.EventDate, item.IsArchived,
                total, items = guests, truncated = total > guests.Count, scope = "Только ваша ветка групп" });
        }
        return new { query, searchedEvents = memberships.Count, matchedEvents = matchesByEvent.Count, totalMatches,
            events = matchesByEvent, scope = "Каждое мероприятие ограничено вашей доступной веткой групп" };
    }

    private async Task<object> SearchStaffAcrossEventsAsync(JsonElement arguments, long loginId, CancellationToken ct)
    {
        var query = ReadQuery(arguments);
        if (query is null) return new { error = "invalid_query", message = "Для поиска нужно от 2 до 100 символов имени." };
        var needle = NormalizeNameQuery(query);
        var memberships = await db.Users.AsNoTracking().Where(x => x.LoginId == loginId)
            .Select(x => new { x.Id, x.EventId, x.GroupId }).ToListAsync(ct);
        var eventNames = await db.Events.AsNoTracking().Where(x => memberships.Select(m => m.EventId).Contains(x.Id))
            .Select(x => new { x.Id, x.Name, x.EventDate, x.IsArchived }).ToDictionaryAsync(x => x.Id, ct);
        var matchesByEvent = new List<object>();
        var totalMatches = 0;
        var staffAccessEvents = 0;
        foreach (var membership in memberships)
        {
            var codes = await permissions.GetUserPermissionsAsync(membership.Id, membership.EventId);
            if (!codes.Contains("create_user")) continue;
            staffAccessEvents++;
            if (!eventNames.TryGetValue(membership.EventId, out var item)) continue;
            var groups = await db.Groups.AsNoTracking().Where(x => x.EventId == membership.EventId).ToListAsync(ct);
            var scope = GroupScope(groups, membership.GroupId);
            if (scope.Count == 0) continue;
            var found = db.Users.AsNoTracking().Where(x => x.EventId == membership.EventId && scope.Contains(x.GroupId)
                && ((x.Name + " " + x.Surname + " " + (x.AdditionalName ?? "")).ToLower().Contains(needle)));
            var total = await found.CountAsync(ct);
            if (total == 0) continue;
            var staff = await found.OrderBy(x => x.Surname).ThenBy(x => x.Name).ThenBy(x => x.Id).Take(20)
                .Select(x => new { x.Id, x.Name, x.Surname, x.AdditionalName, role = x.Role!.Name, x.GroupId, groupName = x.Group!.Name })
                .ToListAsync(ct);
            totalMatches += total;
            matchesByEvent.Add(new { eventId = item.Id, eventName = item.Name, item.EventDate, item.IsArchived,
                total, items = staff, truncated = total > staff.Count, scope = "Только ваша ветка групп" });
        }
        return new { query, searchedEvents = memberships.Count, staffAccessEvents, matchedEvents = matchesByEvent.Count,
            totalMatches, events = matchesByEvent, scope = "Только мероприятия с правом просмотра сотрудников; в каждом — ваша ветка групп" };
    }

    private static string? ReadQuery(JsonElement arguments)
    {
        if (arguments.ValueKind != JsonValueKind.Object || !arguments.TryGetProperty("query", out var item)
            || item.ValueKind != JsonValueKind.String) return null;
        var query = item.GetString()?.Trim();
        return query is { Length: >= 2 and <= 100 } ? query : null;
    }

    private static readonly HashSet<string> DefinitionsNames = ["get_event_summary", "list_guests", "search_guests", "get_guest_neighbors", "get_groups", "get_placements", "get_event_catalogs", "search_guests_across_events", "list_staff", "search_staff", "get_staff_summary", "search_staff_across_events", "propose_event_update", "propose_event_archive", "propose_action", "propose_actions"];

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

    private static string NormalizeNameQuery(string value)
    {
        static string Stem(string word)
        {
            if (word.Length <= 3) return word;
            foreach (var ending in new[] { "ыми", "ими", "ого", "его", "ому", "ему", "ым", "им", "ой", "ей", "ом", "ем" })
                if (word.EndsWith(ending, StringComparison.Ordinal) && word.Length - ending.Length >= 3)
                    return word[..^ending.Length];
            if ((word[^1] is 'а' or 'я' or 'у' or 'ю' or 'ы' or 'и') && word.Length > 4) return word[..^1];
            return word;
        }
        return string.Join(' ', value.Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(Stem));
    }
}
