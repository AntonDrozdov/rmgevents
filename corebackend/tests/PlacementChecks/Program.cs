using Application.Entities;
using Infrastructure.Data;
using Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Npgsql;

// Runs against a fresh disposable database; never modifies the configured application database.
var connection = Environment.GetEnvironmentVariable("PLACEMENT_TEST_POSTGRES") ?? throw new Exception("Set PLACEMENT_TEST_POSTGRES to a PostgreSQL connection string with database creation permission.");
var cs = new NpgsqlConnectionStringBuilder(connection) { Database = "placement_checks_" + Guid.NewGuid().ToString("N") };
ApplicationDbContext Context() => new(new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(cs.ConnectionString).Options);
await using var db = Context();
var checks = 0;
void Check(bool value, string name) { if (!value) throw new Exception(name); checks++; Console.WriteLine("PASS " + name); }
async Task Reject(Func<Task> action, string name) { try { await action(); } catch (InvalidOperationException) { checks++; Console.WriteLine("PASS " + name); db.ChangeTracker.Clear(); return; } throw new Exception("Expected rejection: " + name); }
try
{
    await db.Database.MigrateAsync();
    await db.Database.ExecuteSqlRawAsync("TRUNCATE corebackend.events, corebackend.logins, corebackend.roles RESTART IDENTITY CASCADE");
    await db.Database.ExecuteSqlRawAsync("""
        WITH e AS (INSERT INTO corebackend.events(id,name,event_date,owner_id,created_at,is_archived) VALUES (1,'Placement checks',CURRENT_DATE,1,now(),false)),
        l AS (INSERT INTO corebackend.logins(id,login,password_hash,created_at,must_change_password) VALUES(1,'test','test',now(),false)),
        r AS (INSERT INTO corebackend.roles(id,name,created_at) VALUES(1,'test',now())),
        g AS (INSERT INTO corebackend.groups(id,event_id,name,quota,created_at) VALUES(1,1,'Root',100,now()))
        INSERT INTO corebackend.users(id,login_id,event_id,role_id,group_id,name,surname,created_at) VALUES(1,1,1,1,1,'Test','Test',now());
        INSERT INTO corebackend.groups(id,event_id,parent_group_id,name,quota,created_at) VALUES(2,1,1,'Child',100,now()),(3,1,1,'Other',100,now());
        """);
    var service = new PlacementService(db, null!, null!);
    Check((await service.List(1)).Count == 0, "no default objects");
    await Reject(() => service.Create(1, new("Invalid", null, null, 1)), "group required");
    var list = await service.Create(1, new("Hall", null, 1, null));
    var hall = list.Single();
    list = await service.Create(1, new("Table", hall.Id, 2, 1, 2, 7));
    var tables = list.Where(p => p.ParentId == hall.Id).ToArray();
    Check(tables.Select(p => p.Name).SequenceEqual(new[] { "Table 7", "Table 8" }), "batch numbering");
    await Reject(() => service.Update(1, hall.Id, new("Hall", tables[0].Id, 1, null)), "cycle rejected");
    var a = new Guest { EventId = 1, GroupId = 2, CreatedByUserId = 1, Name = "A", CreatedAt = DateTimeOffset.UtcNow };
    var b = new Guest { EventId = 1, GroupId = 2, CreatedByUserId = 1, Name = "B", CreatedAt = DateTimeOffset.UtcNow };
    db.Guests.AddRange(a, b); await db.SaveChangesAsync();
    await Reject(() => service.Assign(1, hall.Id, a.Id, false), "hall cannot accept guests");
    await service.Assign(1, tables[0].Id, a.Id, false);
    await Reject(() => service.Assign(1, tables[0].Id, b.Id, false), "full quota rejected");
    await Reject(() => service.Update(1, tables[0].Id, new("Table 7", hall.Id, 2, 0)), "quota cannot fall below occupancy");
    await Reject(() => service.Update(1, tables[0].Id, new("Table 7", hall.Id, 2, null)), "occupied table cannot become hall");
    await Reject(() => service.Update(1, tables[0].Id, new("Table 7", hall.Id, 3, 1)), "incompatible group rejected");
    await service.Assign(1, tables[1].Id, a.Id, false);
    list = await service.List(1);
    Check(list.Single(p => p.Id == tables[0].Id).GuestCount == 0 && list.Single(p => p.Id == tables[1].Id).GuestCount == 1, "move frees previous seat");
    Check(list.Single(p => p.Id == tables[1].Id).OccupiedSeatNumbers.SequenceEqual([1]), "occupied seats keep their concrete numbers");
    Check(list.Single(p => p.Id == hall.Id).GuestCount == 0, "child guests do not consume parent quota");
    await service.Update(1, hall.Id, new("Hall", null, 1, 0));
    Check((await service.List(1)).Single(p => p.Id == hall.Id).Quota == 0, "parent quota does not constrain child quotas");
    await Reject(() => service.Delete(1, hall.Id, false), "occupied branch deletion requires confirmation");
    await service.Update(1, tables[1].Id, new("Table 8", hall.Id, 1, 1));
    await Reject(() => service.ValidateGroupMove(1, 2, null), "group move cannot invalidate descendant guest placement");
    await service.Update(1, tables[1].Id, new("Table 8", hall.Id, 2, 1));
    await Reject(async () => { await service.ResolveSeat(1, 3, tables[1].Id); }, "unrelated guest group rejected");
    Check((await service.Guests(1, 1)).Count == 2, "guest selection includes subgroups");
    await service.SaveTemplate(1, "Test template");
    var template = await db.PlacementTemplates.SingleAsync();
    Check(!template.Structure.Contains("\"GroupId\":2"), "template has no group bindings");
    await Reject(() => service.ApplyTemplate(1, template.Id, false), "template replacement requires guest confirmation");
    list = await service.ApplyTemplate(1, template.Id, true);
    Check(list.Count == 3 && list.All(p => p.GroupId == null && p.GuestCount == 0), "template reload clears bindings, keeps hierarchy");
    Check(await db.Guests.CountAsync() == 2 && !await db.Guests.AnyAsync(g => g.PlacementId != null), "replacement keeps guests and unassigns them");
    var table = list.First(p => p.Quota.HasValue);
    await Reject(() => service.Update(1, table.Id, new(table.Name, table.ParentId, null, table.Quota)), "imported object requires group on edit");
    await service.Update(1, table.Id, new(table.Name, table.ParentId, 1, 1));
    async Task<bool> Attempt(long guestId) {
        await using var other = Context();
        try { await new PlacementService(other, null!, null!).Assign(1, table.Id, guestId, false); return true; }
        catch (InvalidOperationException) { return false; }
    }
    var outcomes = await Task.WhenAll(Attempt(a.Id), Attempt(b.Id));
    Check(outcomes.Count(x => x) == 1, "concurrent assignment cannot exceed quota");
    db.ChangeTracker.Clear();
    await service.Delete(1, list.Single(p => p.ParentId == null).Id, true);
    Check((await service.List(1)).Count == 0 && await db.Guests.CountAsync() == 2, "branch deletion preserves guests");
    await Reject(() => service.Create(1, new("Invalid container", null, 1, 10, DisplayChildrenAsRows: true)), "row container cannot have seats");
    await Reject(() => service.Create(1, new("Batch container", null, 1, null, 2, DisplayChildrenAsRows: true)), "row container is created empty and singly");
    list = await service.Create(1, new("Rows", null, 1, null, DisplayChildrenAsRows: true));
    var container = list.Single();
    Check(container.DisplayChildrenAsRows, "row container type is returned");
    await Reject(() => service.Create(1, new("Empty row", container.Id, 1, null)), "row requires seats");
    await Reject(() => service.Create(1, new("Zero row", container.Id, 1, 0)), "row requires positive seats");
    await Reject(() => service.Create(1, new("Nested container", container.Id, 1, null, DisplayChildrenAsRows: true)), "container cannot be a row");
    list = await service.Create(1, new("Row", container.Id, 1, 5, 2));
    Check(list.Count(p => p.ParentId == container.Id && p.Quota == 5) == 2, "batch creates rows with seats");
    var row = list.First(p => p.ParentId == container.Id);
    await Reject(() => service.Update(1, row.Id, new(row.Name, container.Id, 1, null)), "row cannot lose seats");
    await Reject(() => service.Assign(1, container.Id, a.Id, false), "container cannot accept guests");
    list = await service.Create(1, new("Hall outside", null, 1, null));
    var outside = list.Single(p => p.Name == "Hall outside");
    await Reject(() => service.Update(1, outside.Id, new(outside.Name, container.Id, 1, null)), "moving hall into container rejected");
    await service.Create(1, new("Empty child", outside.Id, 1, null));
    await Reject(() => service.Update(1, outside.Id, new(outside.Name, null, 1, null, DisplayChildrenAsRows: true)), "conversion checks existing children");
    await service.SaveTemplate(1, "Rows template");
    var rowsTemplate = await db.PlacementTemplates.SingleAsync(t => t.Name == "Rows template");
    list = await service.ApplyTemplate(1, rowsTemplate.Id, true);
    var restoredContainer = list.Single(p => p.DisplayChildrenAsRows);
    Check(restoredContainer.Quota == null && list.Count(p => p.ParentId == restoredContainer.Id && p.Quota == 5) == 2, "template preserves row container and seats");
    Console.WriteLine($"Completed {checks} integration checks.");
}
finally
{
    await db.Database.EnsureDeletedAsync();
}
