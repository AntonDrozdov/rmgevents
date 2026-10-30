using System.Text.Json;
using Application.Entities;
using Application.Services;
using Infrastructure.Data;
using Infrastructure.Repositories;
using Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using WebApi;

public static class DatabaseChecks
{
    public static async Task Run(string connection, Action<bool, string> check)
    {
        // Always create and drop a unique disposable database, never migrate the configured application DB.
        var cs = new NpgsqlConnectionStringBuilder(connection) { Database = "assistant_checks_" + Guid.NewGuid().ToString("N") };
        await using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(cs.ConnectionString).Options);
        try
        {
            await db.Database.MigrateAsync();
            await db.Database.ExecuteSqlRawAsync("TRUNCATE corebackend.events, corebackend.logins, corebackend.roles RESTART IDENTITY CASCADE");
            await db.Database.ExecuteSqlRawAsync("""
                WITH e AS (INSERT INTO corebackend.events(id,name,event_date,owner_id,created_at,is_archived) VALUES (1,'Assistant test',CURRENT_DATE,1,now(),false)),
                l AS (INSERT INTO corebackend.logins(id,login,password_hash,created_at,must_change_password) VALUES(1,'test','test',now(),false)),
                r AS (INSERT INTO corebackend.roles(id,name,created_at) VALUES(1,'test',now())),
                g AS (INSERT INTO corebackend.groups(id,event_id,name,quota,created_at) VALUES(1,1,'Root',100,now()))
                INSERT INTO corebackend.users(id,login_id,event_id,role_id,group_id,name,surname,created_at) VALUES(1,1,1,1,1,'Test','Test',now());
                INSERT INTO corebackend.groups(id,event_id,parent_group_id,name,quota,created_at) VALUES(2,1,1,'Allowed',40,now()),(3,1,1,'Sibling',30,now()),(4,1,2,'Child',10,now());
                INSERT INTO corebackend.events(id,name,event_date,owner_id,created_at,is_archived) VALUES(2,'Other event',CURRENT_DATE,1,now(),false);
                INSERT INTO corebackend.groups(id,event_id,name,quota,created_at) VALUES(5,2,'Other event root',100,now());
                """);
            db.Placements.AddRange(
                new Placement { Id = 1, EventId = 1, GroupId = 2, Name = "Allowed seat", Quota = 10 },
                new Placement { Id = 2, EventId = 1, GroupId = 3, Name = "Sibling seat", Quota = 20 });
            await db.SaveChangesAsync();
            Guest Guest(long id, long group, string name, long eventId = 1, bool deleted = false) => new() {
                Id = id, EventId = eventId, GroupId = group, Name = name, CreatedByUserId = 1,
                Status = "approved", CreatedAt = DateTimeOffset.UtcNow, IsDeleted = deleted,
                Email = "secret@example.com", Phone = "+70000000000", PlacementId = group == 2 ? 1 : null,
                PlacementSeatNumber = group == 2 ? (int)id : null
            };
            db.Guests.AddRange(Guest(1, 2, "Alice Allowed"), Guest(2, 4, "Alice Child"), Guest(3, 3, "Alice Sibling"), Guest(4, 5, "Alice Other", 2), Guest(5, 2, "Alice Deleted", deleted: true));
            await db.SaveChangesAsync(); db.ChangeTracker.Clear();
            var user = new User { Id = 1, LoginId = 1, EventId = 1, GroupId = 2, Name = "Test", Surname = "Test" };
            var membership = Stub<IUserService>.Create((_, args) => Task.FromResult<User?>((long)args![1]! == 1 ? user : null));
            var permissions = Stub<IPermissionService>.Create((_, _) => Task.FromResult(new List<string> { "create_group" }));
            var tools = new AssistantTools(db, membership, permissions);
            async Task<JsonElement> Call(string name, string args = "{}", long eventId = 1) => JsonSerializer.SerializeToElement(await tools.ExecuteAsync(name, JsonSerializer.Deserialize<JsonElement>(args), 1, eventId, default));
            var summary = await Call("get_event_summary");
            check(summary.GetProperty("total").GetInt32() == 2, "PostgreSQL summary excludes deleted, sibling and foreign guests");
            var search = await Call("search_guests", "{\"query\":\"alice\"}");
            check(search.GetProperty("total").GetInt32() == 2, "PostgreSQL case-insensitive scoped search");
            check(!search.GetRawText().Contains("secret@example.com") && !search.GetRawText().Contains("+70000000000"), "PostgreSQL projection excludes contacts");
            var groups = await Call("get_groups");
            check(groups.GetProperty("total").GetInt32() == 2, "PostgreSQL group scope excludes siblings and other events");
            var placements = await Call("get_placements");
            check(placements.GetProperty("total").GetInt32() == 1
                && placements.GetProperty("totalSeats").GetInt32() == 10
                && placements.GetProperty("occupiedSeats").GetInt32() == 1
                && placements.GetProperty("availableSeats").GetInt32() == 9
                && placements.GetProperty("items")[0].GetProperty("occupiedSeats").GetInt32() == 1,
                "PostgreSQL placement availability excludes deleted guests");
            check((await Call("search_guests", "{\"query\":\"alice\"}", 2)).GetProperty("error").GetString() == "access_denied", "PostgreSQL foreign event denied");
            check((await Call("search_guests", "{\"query\":\"a\"}")).GetProperty("error").GetString() == "query_length", "short query rejected");
            check((await Call("search_guests", "{\"query\":\"' OR 1=1 --\"}")).GetProperty("total").GetInt32() == 0, "SQL-like query treated as literal text");

            var catalogPermissions = Stub<IPermissionService>.Create((method, _) => method.Name switch
            {
                "HasPermissionAsync" or "HasPermissionInAnyEventAsync" => Task.FromResult(true),
                "GetUserPermissionsAsync" => Task.FromResult(new List<string> { "create_guest" }),
                _ => throw new NotSupportedException(method.Name)
            });
            var catalog = new AssistantActionCatalog(membership, catalogPermissions, db);
            db.Categories.Add(new Category { Id = 1, EventId = 1, Name = "Only category", Color = "#292962", CreatedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
            var minimalCreate = await catalog.BuildAsync(JsonSerializer.Deserialize<JsonElement>(
                "{\"operation\":\"create_guest\",\"data\":{\"body\":{\"name\":\"Minimal guest\"}}}"), 1, 1);
            check(minimalCreate.Request.Body!.Value.GetProperty("categoryId").GetInt64() == 1
                && minimalCreate.Request.Body!.Value.GetProperty("groupId").GetInt64() == user.GroupId,
                "single category and current group complete minimal guest creation");
            var partialUpdate = await catalog.BuildAsync(JsonSerializer.Deserialize<JsonElement>(
                "{\"operation\":\"update_guest\",\"data\":{\"guestId\":1,\"body\":{\"groupId\":4}}}"), 1, 1);
            var mergedBody = partialUpdate.Request.Body!.Value;
            check(mergedBody.GetProperty("groupId").GetInt64() == 4
                && mergedBody.GetProperty("name").GetString() == "Alice Allowed"
                && mergedBody.GetProperty("email").GetString() == "secret@example.com"
                && mergedBody.GetProperty("phone").GetString() == "+70000000000"
                && mergedBody.GetProperty("placementId").GetInt64() == 1,
                "partial guest update preserves current fields in reviewed API body");

            var eventRepository = new EventRepository(db);
            var userRepository = new UserRepository(db);
            var audit = new EventLogService(new EventLogRepository(db), userRepository);
            var eventService = new EventService(eventRepository, null!, null!, userRepository, null!, new EventStateGuard(eventRepository), audit, db);
            using var store = new AssistantActionStore();
            var codes = new List<string> { "create_event" };
            var writePermissions = Stub<IPermissionService>.Create((_, _) => Task.FromResult(codes.ToList()));
            var actions = new AssistantActions(db, membership, writePermissions, eventService, store, audit,
                new AssistantActionCatalog(membership, writePermissions));
            async Task Reject(Func<Task> action, int status, string label) {
                try { await action(); } catch (AssistantActionException e) when (e.Status == status) { check(true, label); return; }
                throw new Exception("Expected action rejection: " + label);
            }
            JsonElement Args(string text) => JsonSerializer.Deserialize<JsonElement>(text);
            var proposal = await actions.PrepareAsync("propose_event_update", Args("{\"name\":\"Renamed by assistant\"}"), 1, 1, default);
            check((await db.Events.AsNoTracking().SingleAsync(e => e.Id == 1)).Name == "Assistant test", "proposal does not write before confirmation");
            check(!JsonSerializer.Serialize(proposal).Contains(proposal.Action.Id), "confirmation ID is excluded from model tool result");
            await Reject(() => actions.DecideAsync(proposal.Action.Id, 77, 1, true, default), 403, "another login cannot confirm proposal");
            await Reject(() => actions.DecideAsync(proposal.Action.Id, 1, 2, true, default), 403, "another event cannot confirm proposal");
            codes.Clear();
            await Reject(() => actions.DecideAsync(proposal.Action.Id, 1, 1, true, default), 403, "revoked permission blocks confirmation");
            await Reject(() => actions.PrepareAsync("propose_event_update", Args("{\"name\":\"Forbidden\"}"), 1, 1, default), 403, "missing permission blocks preparation");
            codes.Add("create_event");
            var confirmed = await actions.DecideAsync(proposal.Action.Id, 1, 1, true, default);
            check(confirmed.Status == "completed" && (await db.Events.AsNoTracking().SingleAsync(e => e.Id == 1)).Name == "Renamed by assistant", "confirmation updates through event service");
            check(await db.EventLogs.CountAsync(e => e.Action == "assistant_updated") == 1, "assistant action is audited with actor");
            await actions.DecideAsync(proposal.Action.Id, 1, 1, true, default);
            check(await db.EventLogs.CountAsync(e => e.Action == "assistant_updated") == 1, "replayed confirmation does not repeat write or audit");
            proposal = await actions.PrepareAsync("propose_event_update", Args("{\"description\":\"Cancelled description\"}"), 1, 1, default);
            check((await actions.DecideAsync(proposal.Action.Id, 1, 1, false, default)).Status == "cancelled", "user can cancel proposal");
            check((await actions.DecideAsync(proposal.Action.Id, 1, 1, true, default)).Status == "cancelled", "cancelled proposal cannot be executed");
            proposal = await actions.PrepareAsync("propose_event_update", Args("{\"description\":\"Stale description\"}"), 1, 1, default);
            await db.Events.Where(e => e.Id == 1).ExecuteUpdateAsync(s => s.SetProperty(e => e.Description, "Edited elsewhere"));
            await Reject(() => actions.DecideAsync(proposal.Action.Id, 1, 1, true, default), 409, "stale preview cannot overwrite another edit");
            await Reject(() => actions.PrepareAsync("propose_event_update", Args("{\"eventDate\":\"invalid\"}"), 1, 1, default), 400, "invalid date rejected");
            await Reject(() => actions.PrepareAsync("propose_event_update", Args("{\"eventId\":2,\"name\":\"Wrong event\"}"), 1, 1, default), 400, "model cannot override mutation event");
            proposal = await actions.PrepareAsync("propose_event_archive", Args("{\"isArchived\":true}"), 1, 1, default);
            await actions.DecideAsync(proposal.Action.Id, 1, 1, true, default);
            check((await db.Events.AsNoTracking().SingleAsync(e => e.Id == 1)).IsArchived, "archive proposal can be confirmed");
            await Reject(() => actions.PrepareAsync("propose_event_update", Args("{\"name\":\"Archived edit\"}"), 1, 1, default), 409, "archived event cannot be edited");
            proposal = await actions.PrepareAsync("propose_event_archive", Args("{\"isArchived\":false}"), 1, 1, default);
            await actions.DecideAsync(proposal.Action.Id, 1, 1, true, default);
            check(!(await db.Events.AsNoTracking().SingleAsync(e => e.Id == 1)).IsArchived, "restore event proposal can be confirmed");
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }
}
