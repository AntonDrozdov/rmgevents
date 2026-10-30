using System.Text.Json;
using System.Text.Json.Nodes;
using Application.Services;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace WebApi;

public sealed record AssistantClientRequest(string Method, string Path, JsonElement? Body = null);

public sealed record AssistantClientAction(
    string Operation,
    string Title,
    string? RequiredPermission,
    AssistantClientRequest Request,
    IReadOnlyList<AssistantChange> Changes);

/// <summary>
/// The only client API calls AIMode may propose. The model never supplies an URL or HTTP method.
/// Those values are selected here from a closed operation list.
/// </summary>
public sealed class AssistantActionCatalog(IUserService users, IPermissionService permissions, ApplicationDbContext? db = null)
{
    public static readonly string[] Operations =
    [
        "create_event", "update_event", "set_event_archived",
        "create_guest", "update_guest", "submit_guest", "approve_guest", "reject_guest", "invite_guest",
        "restore_guest_to_saved", "delete_guest", "restore_deleted_guest", "bulk_guest_action",
        "create_group", "update_group", "delete_group", "reset_groups", "apply_original_structure",
        "save_group_template", "apply_group_template",
        "create_category", "update_category", "delete_category",
        "create_tag", "update_tag", "delete_tag",
        "create_user", "update_user", "delete_user", "reset_user_password",
        "create_placement", "update_placement", "delete_placement", "reset_placements", "copy_placements",
        "group_placement_rows", "ungroup_placement_rows", "rotate_placement_rows", "update_seat_label",
        "assign_guest_seat", "remove_guest_seat", "save_placement_template", "apply_placement_template",
        "create_ticket_template", "update_ticket_template", "set_default_ticket_template", "delete_ticket_template"
    ];

    public async Task<AssistantClientAction> BuildAsync(JsonElement args, long loginId, long? eventId, CancellationToken ct = default)
    {
        RequireObject(args, "Некорректные параметры действия.");
        var operation = String(args, "operation", 80);
        if (!Operations.Contains(operation, StringComparer.Ordinal))
            throw new AssistantActionException(400, "Это действие недоступно AIMode.");

        var data = args.TryGetProperty("data", out var suppliedData) ? suppliedData : EmptyObject();
        RequireObject(data, "Поле data должно быть объектом.");

        var permission = PermissionFor(operation);
        Application.Entities.User? member = null;
        if (operation == "create_event" && eventId is null)
        {
            if (!await permissions.HasPermissionInAnyEventAsync(loginId, "create_event"))
                throw new AssistantActionException(403, "Для создания мероприятия требуется разрешение create_event.");
        }
        else
        {
            if (eventId is not long id)
                throw new AssistantActionException(400, "Откройте мероприятие перед подготовкой этого действия.");
            member = await users.GetUserByLoginAndEventAsync(loginId, id);
            if (member is null) throw new AssistantActionException(403, "Нет доступа к мероприятию.");
            if (permission is not null && !await permissions.HasPermissionAsync(loginId, id, permission))
                throw new AssistantActionException(403, $"Для действия требуется разрешение {permission}.");
        }

        data = await CompleteCreateBodyAsync(operation, eventId, data, member, ct);
        data = await CompleteUpdateBodyAsync(operation, eventId, data, ct);
        var action = Build(operation, eventId, data);
        return action with { RequiredPermission = permission };
    }

    public async Task RecheckAsync(long loginId, long? eventId, string operation, string? permission)
    {
        if (operation == "create_event" && eventId is null)
        {
            if (!await permissions.HasPermissionInAnyEventAsync(loginId, "create_event"))
                throw new AssistantActionException(403, "Разрешение create_event было отозвано.");
            return;
        }
        if (eventId is not long id || await users.GetUserByLoginAndEventAsync(loginId, id) is null)
            throw new AssistantActionException(403, "Доступ к мероприятию был отозван.");
        if (permission is not null && !await permissions.HasPermissionAsync(loginId, id, permission))
            throw new AssistantActionException(403, $"Разрешение {permission} было отозвано.");
    }

    private static AssistantClientAction Build(string operation, long? eventId, JsonElement data)
    {
        var id = eventId;
        var body = data.TryGetProperty("body", out var suppliedBody) ? suppliedBody.Clone() : (JsonElement?)null;
        static string EventPath(long? eventId, string suffix) => $"/events/{eventId!.Value}{suffix}";
        static AssistantClientAction A(string operation, string title, string method, string path, JsonElement? body, string summary) =>
            new(operation, title, null, new(method, path, body), Review(operation, summary, body));
        static string Enc(string value) => Uri.EscapeDataString(value);

        return operation switch
        {
            "create_event" => A(operation, "Создать мероприятие", "POST", "/events", RequiredBody(body), Describe(data, "Создание мероприятия")),
            "update_event" => A(operation, "Изменить мероприятие", "PUT", EventPath(id, ""), RequiredBody(body), Describe(data, "Изменение настроек мероприятия")),
            "set_event_archived" => A(operation, "Изменить статус мероприятия", "PATCH", EventPath(id, "/archive-status"), RequiredBody(body), Describe(data, "Изменение статуса мероприятия")),

            "create_guest" => A(operation, "Добавить гостя", "POST", EventPath(id, "/guests"), RequiredBody(body), Describe(data, "Создание гостя")),
            "update_guest" => A(operation, $"Изменить гостя #{Long(data, "guestId")}", "PUT", EventPath(id, $"/guests/{Long(data, "guestId")}"), RequiredBody(body), Describe(data, "Изменение данных гостя")),
            "submit_guest" => GuestPost(operation, id, data, "submit-for-review", "Отправить гостя на согласование"),
            "approve_guest" => GuestApproval(operation, id, data, true),
            "reject_guest" => GuestApproval(operation, id, data, false),
            "invite_guest" => GuestPost(operation, id, data, "invite", "Пригласить гостя"),
            "restore_guest_to_saved" => GuestPost(operation, id, data, "restore-to-saved", "Вернуть гостя в сохранённые"),
            "delete_guest" => A(operation, $"Удалить гостя #{Long(data, "guestId")}", "DELETE", EventPath(id, $"/guests/{Long(data, "guestId")}"), null, "Мягкое удаление гостя"),
            "restore_deleted_guest" => GuestPost(operation, id, data, "restore", "Восстановить удалённого гостя"),
            "bulk_guest_action" => A(operation, "Выполнить массовое действие с гостями", "POST", EventPath(id, "/guests/bulk/action"), RequiredBody(body), Describe(data, "Массовое действие с выбранными гостями")),

            "create_group" => A(operation, "Создать группу", "POST", EventPath(id, "/groups"), RequiredBody(body), Describe(data, "Создание группы")),
            "update_group" => A(operation, $"Изменить группу #{Long(data, "groupId")}", "PUT", EventPath(id, $"/groups/{Long(data, "groupId")}"), RequiredBody(body), Describe(data, "Изменение группы")),
            "delete_group" => A(operation, $"Удалить группу #{Long(data, "groupId")}", "DELETE", EventPath(id, $"/groups/{Long(data, "groupId")}"), null, "Удаление группы"),
            "reset_groups" => A(operation, "Сбросить структуру групп", "POST", EventPath(id, "/groups/reset"), null, "Удаление пользовательских групп и возврат к корневой группе"),
            "apply_original_structure" => A(operation, "Применить исходную структуру", "POST", EventPath(id, "/groups/apply-original-structure"), null, "Создание групп из ранее загруженной оргструктуры"),
            "save_group_template" => A(operation, "Сохранить шаблон групп", "POST", EventPath(id, "/groups/templates"), RequiredBody(body), Describe(data, "Сохранение текущей структуры как шаблона")),
            "apply_group_template" => A(operation, "Применить шаблон групп", "POST", EventPath(id, "/groups/apply-template"), RequiredBody(body), Describe(data, "Замена структуры групп выбранным шаблоном")),

            "create_category" => A(operation, "Создать категорию", "POST", EventPath(id, "/categories"), RequiredBody(body), Describe(data, "Создание категории")),
            "update_category" => EntityBody(operation, id, data, "categoryId", "categories", "Изменить категорию", "PUT", body),
            "delete_category" => EntityDelete(operation, id, data, "categoryId", "categories", "Удалить категорию"),
            "create_tag" => A(operation, "Создать метку", "POST", EventPath(id, "/tags"), RequiredBody(body), Describe(data, "Создание метки")),
            "update_tag" => EntityBody(operation, id, data, "tagId", "tags", "Изменить метку", "PUT", body),
            "delete_tag" => EntityDelete(operation, id, data, "tagId", "tags", "Удалить метку"),

            "create_user" => A(operation, "Создать сотрудника", "POST", EventPath(id, "/users"), RequiredBody(body), Describe(data, "Создание сотрудника и учётной записи")),
            "update_user" => EntityBody(operation, id, data, "userId", "users", "Изменить сотрудника", "PUT", body),
            "delete_user" => EntityDelete(operation, id, data, "userId", "users", "Удалить сотрудника"),
            "reset_user_password" => A(operation, $"Сбросить пароль сотрудника #{Long(data, "userId")}", "POST", EventPath(id, $"/users/{Long(data, "userId")}/reset-password"), null, "Создание временного пароля; он будет показан один раз"),

            "create_placement" => A(operation, "Создать объект размещения", "POST", EventPath(id, "/placements"), RequiredBody(body), Describe(data, "Создание объекта на схеме")),
            "update_placement" => EntityBody(operation, id, data, "placementId", "placements", "Изменить объект размещения", "PUT", body),
            "delete_placement" => A(operation, $"Удалить объект размещения #{Long(data, "placementId")}", "DELETE", EventPath(id, $"/placements/{Long(data, "placementId")}?confirmed=true"), null, "Удаление объекта со схемы"),
            "reset_placements" => A(operation, "Очистить схему размещения", "DELETE", EventPath(id, "/placements?confirmed=true"), null, "Удаление всех объектов схемы"),
            "copy_placements" => A(operation, "Копировать объекты размещения", "POST", EventPath(id, "/placements/copy"), RequiredBody(body), Describe(data, "Копирование выбранных объектов")),
            "group_placement_rows" => A(operation, "Сгруппировать ряды", "POST", EventPath(id, "/placements/rows/group"), RequiredBody(body), Describe(data, "Группировка выбранных рядов")),
            "ungroup_placement_rows" => A(operation, "Разгруппировать ряды", "POST", EventPath(id, $"/placements/rows/batches/{Enc(String(data, "batchId", 64))}/ungroup"), null, "Разгруппировка ряда"),
            "rotate_placement_rows" => A(operation, "Повернуть ряды", "PUT", EventPath(id, "/placements/rows/rotation"), RequiredBody(body), Describe(data, "Изменение поворота рядов")),
            "update_seat_label" => A(operation, "Изменить подпись места", "PUT", EventPath(id, $"/placements/{Long(data, "placementId")}/seats/{Int(data, "seatNumber")}/label"), RequiredBody(body), Describe(data, "Изменение подписи места")),
            "assign_guest_seat" => SeatAssignment(operation, id, data, false),
            "remove_guest_seat" => SeatAssignment(operation, id, data, true),
            "save_placement_template" => A(operation, "Сохранить шаблон размещения", "POST", EventPath(id, "/placements/templates"), RequiredBody(body), Describe(data, "Сохранение схемы как шаблона")),
            "apply_placement_template" => A(operation, "Применить шаблон размещения", "POST", EventPath(id, $"/placements/templates/{Long(data, "templateId")}/apply?confirmed=true"), null, "Замена схемы выбранным шаблоном"),

            "create_ticket_template" => A(operation, "Создать шаблон билета", "POST", EventPath(id, "/ticket-templates"), RequiredBody(body), Describe(data, "Создание шаблона билета")),
            "update_ticket_template" => EntityBody(operation, id, data, "templateId", "ticket-templates", "Изменить шаблон билета", "PUT", body),
            "set_default_ticket_template" => A(operation, "Назначить шаблон билета по умолчанию", "POST", EventPath(id, $"/ticket-templates/{Long(data, "templateId")}/default"), null, "Изменение шаблона билета по умолчанию"),
            "delete_ticket_template" => A(operation, "Удалить шаблон билета", "DELETE", EventPath(id, $"/ticket-templates/{Long(data, "templateId")}"), null, "Удаление шаблона билета"),
            _ => throw new AssistantActionException(400, "Неизвестное действие.")
        };
    }

    private async Task<JsonElement> CompleteCreateBodyAsync(string operation, long? eventId, JsonElement data,
        Application.Entities.User? member, CancellationToken ct)
    {
        if (operation is not ("create_event" or "create_guest" or "create_group" or "create_category" or "create_tag"
            or "create_user" or "create_placement" or "create_ticket_template")) return data;

        var root = JsonNode.Parse(data.GetRawText())?.AsObject()
            ?? throw new AssistantActionException(400, "Некорректное поле data.");
        JsonObject body;
        if (root["body"] is null)
        {
            body = new JsonObject();
            root["body"] = body;
        }
        else if (root["body"] is JsonObject suppliedBody) body = suppliedBody;
        else throw new AssistantActionException(400, "Для действия требуется объект data.body.");

        static void Fill(JsonObject target, string name, object? value)
        {
            if (!target.ContainsKey(name)) target[name] = value is null ? null : JsonSerializer.SerializeToNode(value);
        }
        static bool Bool(JsonObject target, string name)
            => target[name] is JsonValue value && value.TryGetValue<bool>(out var result) && result;
        void CopyFlatFields(params string[] names)
        {
            foreach (var name in names)
                if (!body.ContainsKey(name) && root[name] is JsonNode value) body[name] = value.DeepClone();
        }

        switch (operation)
        {
            case "create_event":
                CopyFlatFields("name", "eventDate", "logoImageId");
                Fill(body, "logoImageId", null);
                break;
            case "create_guest":
                CopyFlatFields("name", "email", "phone", "groupId", "categoryId", "tagIds", "placementId", "placementSeatNumber");
                if (member is not null) Fill(body, "groupId", member.GroupId);
                if (!body.ContainsKey("categoryId") && db is not null && eventId is long guestEventId)
                {
                    var categoryIds = await db.Categories.AsNoTracking().Where(x => x.EventId == guestEventId)
                        .OrderBy(x => x.Id).Select(x => x.Id).Take(2).ToListAsync(ct);
                    if (categoryIds.Count == 1) Fill(body, "categoryId", categoryIds[0]);
                }
                Fill(body, "tagIds", Array.Empty<long>());
                break;
            case "create_group":
                CopyFlatFields("name", "quota", "parentGroupId");
                Fill(body, "quota", 0);
                Fill(body, "parentGroupId", null);
                break;
            case "create_category":
                CopyFlatFields("name", "color");
                Fill(body, "color", "#292962");
                break;
            case "create_tag":
                CopyFlatFields("name", "color");
                Fill(body, "color", "#FFFFFF");
                break;
            case "create_user":
                CopyFlatFields("login", "name", "surname", "additionalName", "email", "tel", "roleId", "groupId", "organizationEmployeeId");
                if (member is not null) Fill(body, "groupId", member.GroupId);
                Fill(body, "additionalName", null); Fill(body, "email", null); Fill(body, "tel", null);
                Fill(body, "organizationEmployeeId", null);
                break;
            case "create_placement":
                CopyFlatFields("name", "parentId", "groupId", "quota", "count", "startNumber", "displayChildrenAsRows",
                    "canvasX", "canvasY", "canvasWidth", "canvasHeight", "isRow", "preserveRowBatch", "color",
                    "isLabel", "fontSize", "rotation", "seatStartNumber", "seatNumberingReversed", "seatName");
                var isLabel = Bool(body, "isLabel");
                var isContainer = Bool(body, "displayChildrenAsRows");
                Fill(body, "parentId", null);
                Fill(body, "groupId", isLabel ? null : member?.GroupId);
                Fill(body, "quota", isLabel || isContainer ? null : 10);
                Fill(body, "count", 1); Fill(body, "startNumber", 1);
                Fill(body, "displayChildrenAsRows", false); Fill(body, "isRow", false);
                Fill(body, "preserveRowBatch", false); Fill(body, "color", null);
                Fill(body, "isLabel", false); Fill(body, "fontSize", 18); Fill(body, "rotation", 0);
                Fill(body, "seatStartNumber", 1); Fill(body, "seatNumberingReversed", false); Fill(body, "seatName", null);
                break;
            case "create_ticket_template":
                CopyFlatFields("name", "backgroundImageId", "qrX", "qrY", "qrSize", "qrRadius");
                Fill(body, "qrX", 1600); Fill(body, "qrY", 2400);
                Fill(body, "qrSize", 400); Fill(body, "qrRadius", 24);
                break;
        }

        var completed = JsonSerializer.SerializeToElement(root);
        var completedBody = completed.GetProperty("body");
        switch (operation)
        {
            case "create_event":
                String(completedBody, "name", 255); String(completedBody, "eventDate", 32);
                break;
            case "create_guest":
                String(completedBody, "name", 500); Long(completedBody, "groupId");
                if (!completedBody.TryGetProperty("categoryId", out var category) || category.ValueKind != JsonValueKind.Number
                    || !category.TryGetInt64(out var categoryId) || categoryId <= 0)
                    throw new AssistantActionException(400, "Для создания гостя укажите категорию. Email, телефон, метки и размещение необязательны.");
                break;
            case "create_group": String(completedBody, "name", 500); break;
            case "create_category": String(completedBody, "name", 50); break;
            case "create_tag": String(completedBody, "name", 50); break;
            case "create_user":
                String(completedBody, "login", 255); String(completedBody, "name", 255); String(completedBody, "surname", 255);
                Long(completedBody, "roleId"); Long(completedBody, "groupId");
                break;
            case "create_placement":
                String(completedBody, "name", 140);
                if (!Bool(body, "isLabel")) Long(completedBody, "groupId");
                break;
            case "create_ticket_template":
                String(completedBody, "name", 120); Long(completedBody, "backgroundImageId");
                break;
        }
        return completed;
    }

    private async Task<JsonElement> CompleteUpdateBodyAsync(string operation, long? eventId, JsonElement data, CancellationToken ct)
    {
        if (db is null || eventId is not long id || !operation.StartsWith("update_", StringComparison.Ordinal)) return data;
        var root = JsonNode.Parse(data.GetRawText())?.AsObject() ?? throw new AssistantActionException(400, "Некорректное поле data.");
        if (root["body"] is not JsonObject body) throw new AssistantActionException(400, "Для изменения требуется объект data.body.");
        static void Fill(JsonObject target, string name, object? value)
        {
            if (!target.ContainsKey(name)) target[name] = value is null ? null : JsonSerializer.SerializeToNode(value);
        }

        switch (operation)
        {
            case "update_event":
                var item = await db.Events.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct)
                    ?? throw new AssistantActionException(404, "Мероприятие не найдено.");
                Fill(body, "name", item.Name); Fill(body, "description", item.Description);
                Fill(body, "eventDate", item.EventDate); Fill(body, "logoImageId", item.LogoImageId);
                break;
            case "update_guest":
                var guestId = Long(data, "guestId");
                var guest = await db.Guests.AsNoTracking().SingleOrDefaultAsync(x => x.Id == guestId && x.EventId == id, ct)
                    ?? throw new AssistantActionException(404, "Гость не найден.");
                var categoryId = await db.GuestCategories.AsNoTracking().Where(x => x.GuestId == guestId).Select(x => (long?)x.CategoryId).SingleOrDefaultAsync(ct);
                var tagIds = await db.GuestTags.AsNoTracking().Where(x => x.GuestId == guestId).OrderBy(x => x.TagId).Select(x => x.TagId).ToListAsync(ct);
                Fill(body, "name", guest.Name); Fill(body, "email", guest.Email); Fill(body, "phone", guest.Phone);
                Fill(body, "groupId", guest.GroupId); Fill(body, "categoryId", categoryId); Fill(body, "tagIds", tagIds);
                Fill(body, "placementId", guest.PlacementId); Fill(body, "placementSeatNumber", guest.PlacementSeatNumber);
                break;
            case "update_group":
                var groupId = Long(data, "groupId");
                var group = await db.Groups.AsNoTracking().SingleOrDefaultAsync(x => x.Id == groupId && x.EventId == id, ct)
                    ?? throw new AssistantActionException(404, "Группа не найдена.");
                Fill(body, "name", group.Name); Fill(body, "quota", group.Quota); Fill(body, "parentGroupId", group.ParentGroupId);
                Fill(body, "moveToParent", false);
                break;
            case "update_category":
                var categoryKey = Long(data, "categoryId");
                var category = await db.Categories.AsNoTracking().SingleOrDefaultAsync(x => x.Id == categoryKey && x.EventId == id, ct)
                    ?? throw new AssistantActionException(404, "Категория не найдена.");
                Fill(body, "name", category.Name); Fill(body, "color", category.Color);
                break;
            case "update_tag":
                var tagId = Long(data, "tagId");
                var tag = await db.Tags.AsNoTracking().SingleOrDefaultAsync(x => x.Id == tagId && x.EventId == id, ct)
                    ?? throw new AssistantActionException(404, "Метка не найдена.");
                Fill(body, "name", tag.Name); Fill(body, "color", tag.Color);
                break;
            case "update_user":
                var userId = Long(data, "userId");
                var employee = await db.Users.AsNoTracking().Where(x => x.Id == userId && x.EventId == id)
                    .Select(x => new { Login = x.Login!.LoginValue, x.Name, x.Surname, x.AdditionalName, x.Email, x.Tel, x.RoleId, x.GroupId })
                    .SingleOrDefaultAsync(ct) ?? throw new AssistantActionException(404, "Сотрудник не найден.");
                Fill(body, "login", employee.Login); Fill(body, "name", employee.Name); Fill(body, "surname", employee.Surname);
                Fill(body, "additionalName", employee.AdditionalName); Fill(body, "email", employee.Email); Fill(body, "tel", employee.Tel);
                Fill(body, "roleId", employee.RoleId); Fill(body, "groupId", employee.GroupId);
                break;
            case "update_placement":
                var placementId = Long(data, "placementId");
                var placement = await db.Placements.AsNoTracking().SingleOrDefaultAsync(x => x.Id == placementId && x.EventId == id, ct)
                    ?? throw new AssistantActionException(404, "Объект размещения не найден.");
                Fill(body, "name", placement.Name); Fill(body, "parentId", placement.ParentId); Fill(body, "groupId", placement.GroupId);
                Fill(body, "quota", placement.Quota); Fill(body, "count", 1); Fill(body, "startNumber", 1);
                Fill(body, "displayChildrenAsRows", placement.DisplayChildrenAsRows); Fill(body, "canvasX", placement.CanvasX);
                Fill(body, "canvasY", placement.CanvasY); Fill(body, "canvasWidth", placement.CanvasWidth); Fill(body, "canvasHeight", placement.CanvasHeight);
                Fill(body, "isRow", placement.IsRow); Fill(body, "preserveRowBatch", true); Fill(body, "color", placement.Color);
                Fill(body, "isLabel", placement.IsLabel); Fill(body, "fontSize", placement.FontSize); Fill(body, "rotation", placement.Rotation);
                Fill(body, "seatStartNumber", placement.SeatStartNumber); Fill(body, "seatNumberingReversed", placement.SeatNumberingReversed);
                Fill(body, "seatName", placement.SeatName);
                break;
            case "update_ticket_template":
                var templateId = Long(data, "templateId");
                var template = await db.TicketTemplates.AsNoTracking().SingleOrDefaultAsync(x => x.Id == templateId && x.EventId == id, ct)
                    ?? throw new AssistantActionException(404, "Шаблон билета не найден.");
                Fill(body, "name", template.Name); Fill(body, "backgroundImageId", template.BackgroundImageId);
                Fill(body, "qrX", template.QrX); Fill(body, "qrY", template.QrY); Fill(body, "qrSize", template.QrSize); Fill(body, "qrRadius", template.QrRadius);
                break;
        }
        return JsonSerializer.SerializeToElement(root);
    }

    private static AssistantClientAction GuestPost(string operation, long? eventId, JsonElement data, string suffix, string title)
    {
        var guestId = Long(data, "guestId");
        return new(operation, $"{title} #{guestId}", null,
            new("POST", $"/events/{eventId}/guests/{guestId}/{suffix}"), [new("Что будет сделано", "", title)]);
    }

    private static AssistantClientAction GuestApproval(string operation, long? eventId, JsonElement data, bool approve)
    {
        var guestId = Long(data, "guestId");
        var body = JsonSerializer.SerializeToElement(new { guestId, approve });
        var title = approve ? "Согласовать гостя" : "Отклонить гостя";
        return new(operation, $"{title} #{guestId}", null,
            new("POST", $"/events/{eventId}/guests/{guestId}/approve", body), [new("Решение", "", approve ? "Согласовать гостя" : "Отклонить гостя")]);
    }

    private static AssistantClientAction SeatAssignment(string operation, long? eventId, JsonElement data, bool remove)
    {
        var placementId = Long(data, "placementId");
        var guestId = Long(data, "guestId");
        var body = JsonSerializer.SerializeToElement(new { remove });
        var title = remove ? "Снять гостя с места" : "Назначить гостю место";
        return new(operation, title, null,
            new("PUT", $"/events/{eventId}/placements/{placementId}/guests/{guestId}", body),
            [new("Размещение", "", $"{title}: гость #{guestId}, объект #{placementId}")]);
    }

    private static AssistantClientAction EntityBody(string operation, long? eventId, JsonElement data, string idName,
        string segment, string title, string method, JsonElement? body)
    {
        var entityId = Long(data, idName);
        return new(operation, $"{title} #{entityId}", null,
            new(method, $"/events/{eventId}/{segment}/{entityId}", RequiredBody(body)),
            Review(operation, Describe(data, title), body));
    }

    private static AssistantClientAction EntityDelete(string operation, long? eventId, JsonElement data, string idName, string segment, string title)
    {
        var entityId = Long(data, idName);
        return new(operation, $"{title} #{entityId}", null,
            new("DELETE", $"/events/{eventId}/{segment}/{entityId}"), [new("Что будет сделано", "", title)]);
    }

    private static string? PermissionFor(string operation) => operation switch
    {
        "create_event" or "update_event" or "set_event_archived" or
        "reset_groups" or "apply_original_structure" or "save_group_template" or "apply_group_template" or
        "create_category" or "update_category" or "delete_category" or
        "create_tag" or "update_tag" or "delete_tag" or
        "create_ticket_template" or "update_ticket_template" or "set_default_ticket_template" or "delete_ticket_template" => "create_event",
        "create_group" or "update_group" or "delete_group" or
        "create_placement" or "update_placement" or "delete_placement" or "reset_placements" or "copy_placements" or
        "group_placement_rows" or "ungroup_placement_rows" or "rotate_placement_rows" or "update_seat_label" or
        "assign_guest_seat" or "remove_guest_seat" or "save_placement_template" or "apply_placement_template" => "create_group",
        "approve_guest" or "reject_guest" or "restore_guest_to_saved" => "approve_guest",
        "create_guest" or "update_guest" or "submit_guest" or "invite_guest" or "delete_guest" or "restore_deleted_guest" => "create_guest",
        "create_user" or "update_user" or "delete_user" or "reset_user_password" => "create_user",
        "bulk_guest_action" => null,
        _ => throw new AssistantActionException(400, "Неизвестное действие.")
    };

    private static JsonElement RequiredBody(JsonElement? body)
    {
        if (body is not { ValueKind: JsonValueKind.Object } value)
            throw new AssistantActionException(400, "Для действия требуется объект data.body.");
        return value.Clone();
    }

    private static string Describe(JsonElement data, string fallback)
    {
        if (data.TryGetProperty("summary", out var value) && value.ValueKind == JsonValueKind.String)
        {
            var text = value.GetString()!.Trim();
            if (text.Length is > 0 and <= 500
                && !text.Contains("/events", StringComparison.OrdinalIgnoreCase)
                && !new[] { "GET ", "POST ", "PUT ", "PATCH ", "DELETE " }.Any(text.Contains)) return text;
        }
        return fallback;
    }

    private static IReadOnlyList<AssistantChange> Review(string operation, string summary, JsonElement? body)
    {
        var changes = new List<AssistantChange>
        {
            new("Что будет сделано", "", summary)
        };
        if (body is { ValueKind: JsonValueKind.Object } value)
        {
            foreach (var property in value.EnumerateObject().Where(property => ShowInReview(operation, property)).Take(40))
                changes.Add(new(FieldLabel(operation, property.Name), "", DisplayField(operation, property.Name, property.Value)));
        }
        else if (body is { } other)
            changes.Add(new("Данные", "", Display(operation, other)));
        return changes;
    }

    private static bool ShowInReview(string operation, JsonProperty property)
    {
        if (property.Value.ValueKind == JsonValueKind.Null || property.Name == "preserveRowBatch") return false;
        if (operation is "create_placement" or "update_placement"
            && property.Value.ValueKind == JsonValueKind.False
            && property.Name is "displayChildrenAsRows" or "isLabel" or "seatNumberingReversed") return false;
        return true;
    }

    private static string DisplayField(string operation, string name, JsonElement value) => name switch
    {
        "isRow" when value.ValueKind is JsonValueKind.True or JsonValueKind.False => value.GetBoolean() ? "Ряд" : "Стол",
        "isArchived" when value.ValueKind is JsonValueKind.True or JsonValueKind.False => value.GetBoolean() ? "Завершено" : "Активно",
        _ => Display(operation, value)
    };

    private static string FieldLabel(string operation, string name) => name switch
    {
        "name" => operation switch
        {
            "create_guest" or "update_guest" => "Имя гостя",
            "create_group" or "update_group" => "Название группы",
            "create_category" or "update_category" => "Название категории",
            "create_tag" or "update_tag" => "Название метки",
            "create_user" or "update_user" => "Имя сотрудника",
            "create_placement" or "update_placement" => "Название объекта",
            "create_ticket_template" or "update_ticket_template" => "Название шаблона",
            _ => "Название"
        },
        "description" => "Описание",
        "eventDate" => "Дата мероприятия",
        "logoImageId" => "Логотип",
        "email" => "Email",
        "phone" or "tel" => "Телефон",
        "surname" => "Фамилия",
        "additionalName" => "Отчество",
        "login" => "Логин",
        "groupId" => "Группа",
        "categoryId" => "Категория",
        "tagIds" => "Метки",
        "roleId" => "Роль",
        "organizationEmployeeId" => "Сотрудник оргструктуры",
        "placementId" => "Объект размещения",
        "placementSeatNumber" or "seatNumber" => "Номер места",
        "quota" => "Количество мест",
        "count" => "Количество объектов",
        "startNumber" => "Начальный номер",
        "parentGroupId" => "Родительская группа",
        "parentId" => "Родительский объект",
        "displayChildrenAsRows" => "Отображать дочерние объекты как ряды",
        "isRow" => "Тип объекта",
        "color" => "Цвет",
        "isLabel" => "Надпись",
        "fontSize" => "Размер шрифта",
        "rotation" => "Поворот",
        "seatStartNumber" => "Первый номер места",
        "seatNumberingReversed" => "Обратная нумерация мест",
        "seatName" => "Название места",
        "canvasX" => "Позиция по горизонтали",
        "canvasY" => "Позиция по вертикали",
        "canvasWidth" => "Ширина",
        "canvasHeight" => "Высота",
        "qrX" => "QR: позиция по горизонтали",
        "qrY" => "QR: позиция по вертикали",
        "qrSize" => "Размер QR-кода",
        "qrRadius" => "Скругление QR-кода",
        "backgroundImageId" => "Подложка билета",
        "action" => "Операция",
        "selection" => "Выбранные гости",
        "ids" => "Выбранные объекты",
        "remove" => "Снять размещение",
        "isArchived" => "Статус мероприятия",
        _ => name
    };

    private static string Display(string operation, JsonElement value)
    {
        var text = value.ValueKind switch
        {
            JsonValueKind.String => value.GetString() ?? "—",
            JsonValueKind.Null => "Не указано",
            JsonValueKind.True => "Да",
            JsonValueKind.False => "Нет",
            JsonValueKind.Array => value.GetArrayLength() == 0 ? "Нет" : string.Join(", ", value.EnumerateArray().Select(item => Display(operation, item))),
            JsonValueKind.Object => string.Join("; ", value.EnumerateObject().Take(40)
                .Select(property => $"{FieldLabel(operation, property.Name)}: {Display(operation, property.Value)}")),
            _ => value.ToString()
        };
        return text.Length <= 4000 ? text : text[..4000] + "…";
    }

    private static long Long(JsonElement data, string name)
    {
        if (!data.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.Number || !value.TryGetInt64(out var result) || result <= 0)
            throw new AssistantActionException(400, $"Поле {name} должно быть положительным числом.");
        return result;
    }

    private static int Int(JsonElement data, string name)
    {
        if (!data.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.Number || !value.TryGetInt32(out var result) || result <= 0)
            throw new AssistantActionException(400, $"Поле {name} должно быть положительным числом.");
        return result;
    }

    private static string String(JsonElement data, string name, int maxLength)
    {
        if (!data.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String)
            throw new AssistantActionException(400, $"Поле {name} обязательно.");
        var result = value.GetString()!.Trim();
        if (result.Length is 0 || result.Length > maxLength)
            throw new AssistantActionException(400, $"Некорректная длина поля {name}.");
        return result;
    }

    private static void RequireObject(JsonElement value, string message)
    {
        if (value.ValueKind != JsonValueKind.Object) throw new AssistantActionException(400, message);
    }

    private static JsonElement EmptyObject() => JsonSerializer.SerializeToElement(new { });
}
