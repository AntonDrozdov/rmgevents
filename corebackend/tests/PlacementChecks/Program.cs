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
    var list = await service.Create(1, new("Hall", null, 1, null, DisplayChildrenAsRows: true));
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
    await service.Update(1, hall.Id, new("Hall", null, 1, null, DisplayChildrenAsRows: true));
    Check((await service.List(1)).Single(p => p.Id == hall.Id).Quota == null, "container remains without seats");
    await Reject(() => service.Delete(1, hall.Id, false), "occupied branch deletion requires confirmation");
    await service.Update(1, tables[1].Id, new("Table 8", hall.Id, 1, 1));
    await Reject(() => service.ValidateGroupMove(1, 2, null), "group move cannot invalidate descendant guest placement");
    await service.Update(1, tables[1].Id, new("Table 8", hall.Id, 2, 1));
    list = await service.UpdateSeatLabel(1, tables[1].Id, 1, "A-01");
    Check(list.Single(p => p.Id == tables[1].Id).SeatLabels?.GetValueOrDefault(1) == "A-01", "seat label is saved separately from its internal number");
    await Reject(() => service.UpdateSeatLabel(1, tables[1].Id, 2, "A-02"), "seat label rejects a nonexistent seat");
    await Reject(async () => { await service.ResolveSeat(1, 3, tables[1].Id); }, "unrelated guest group rejected");
    Check((await service.Guests(1, 1)).Count == 2, "guest selection includes subgroups");
    await service.SaveTemplate(1, "Test template");
    var template = await db.PlacementTemplates.SingleAsync(t => t.Name == "Test template");
    Check(!template.Structure.Contains("\"GroupId\":2"), "template has no group bindings");
    await Reject(() => service.ApplyTemplate(1, template.Id, false), "template replacement requires guest confirmation");
    list = await service.ApplyTemplate(1, template.Id, true);
    Check(list.Count == 3 && list.All(p => p.GroupId == 1 && p.GuestCount == 0), "template reload assigns the root group and keeps hierarchy");
    Check(list.Single(p => p.Name == "Table 8").SeatLabels?.GetValueOrDefault(1) == "A-01", "template preserves seat labels");
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
    await Reject(() => service.Create(1, new("Empty row", container.Id, 1, null, IsRow: true)), "row requires seats");
    await Reject(() => service.Create(1, new("Zero row", container.Id, 1, 0, IsRow: true)), "row requires positive seats");
    await Reject(() => service.Create(1, new("Nested container", container.Id, 1, null, DisplayChildrenAsRows: true)), "container cannot be a row");
    list = await service.Create(1, new("Row", container.Id, 1, 5, 2, IsRow: true));
    Check(list.Count(p => p.ParentId == container.Id && p.Quota == 5) == 2, "batch creates rows with seats");
    var row = list.First(p => p.ParentId == container.Id);
    await Reject(() => service.Update(1, row.Id, new(row.Name, container.Id, 1, null, IsRow: true)), "row cannot lose seats");
    var rotationPeers = list.Where(p => p.ParentId == container.Id && p.IsRow).ToArray();
    list = await service.RotateRows(1, rotationPeers.Select(p => new PlacementService.RowRotation(p.Id, 315)).ToArray());
    Check(rotationPeers.All(peer => list.Single(p => p.Id == peer.Id).Rotation == 315), "rotation saves all selected rows");
    await Reject(() => service.RotateRows(1, [new(row.Id, 90), new(container.Id, 90)]), "rotation rejects non-row objects atomically");
    await using (var unchanged = Context())
        Check((await unchanged.Placements.AsNoTracking().SingleAsync(p => p.Id == row.Id)).Rotation == 315, "rejected rotation leaves other rows unchanged");
    Check(list.Single(p => p.Id == row.Id).Rotation == 315, "row rotation is saved");
    Check(list.Single(p => p.Id == row.Id).RowBatchId == row.RowBatchId, "rotating a row preserves its group");
    await using (var reloaded = Context())
        Check((await reloaded.Placements.AsNoTracking().SingleAsync(p => p.Id == row.Id)).Rotation == 315, "row rotation survives database reload");
    await Reject(() => service.Update(1, row.Id, new(row.Name, container.Id, 1, 5, IsRow: true, Rotation: 360)), "invalid row rotation is rejected");
    await Reject(() => service.Assign(1, container.Id, a.Id, false), "container cannot accept guests");
    list = await service.Create(1, new("Hall outside", null, 1, null));
    var outside = list.Single(p => p.Name == "Hall outside");
    await Reject(() => service.Update(1, outside.Id, new(outside.Name, container.Id, 1, null)), "moving hall into container rejected");
    list = await service.Create(1, new("Сцена", null, 1, null, Color: "#336699", IsLabel: true));
    var label = list.Single(p => p.Name == "Сцена");
    Check(label.IsLabel && label.Quota == null && label.Color == "#336699", "label object is created without seats");
    await Reject(() => service.Create(1, new("Invalid label", null, 1, 1, IsLabel: true)), "label cannot contain seats");
    list = await service.Copy(1, [label.Id]);
    Check(list.Count(p => p.IsLabel && p.Name == "Сцена") == 2, "label object can be copied");
    list = await service.GroupRows(1, [label.Id, outside.Id]);
    var labelBatchId = list.Single(p => p.Id == label.Id).RowBatchId;
    Check(labelBatchId.HasValue && list.Single(p => p.Id == outside.Id).RowBatchId == labelBatchId, "label object can be grouped with another object");
    await service.UngroupRows(1, labelBatchId!.Value);
    var numberedRows = (await service.List(1)).Where(p => p.IsRow && p.ParentId == container.Id).ToArray();
    Check(numberedRows.All(p => p.SeatStartNumber == 1 && !p.SeatNumberingReversed && p.SeatName == null), "row seat numbering defaults");
    list = await service.UpdateRowBatch(1, numberedRows[0].RowBatchId!.Value, new("Row", container.Id, 1, 5, 2, IsRow: true, Rotation: 315, SeatStartNumber: 10, SeatNumberingReversed: true, SeatName: "VIP"));
    Check(list.Where(p => p.IsRow && p.ParentId == container.Id).All(p => p.SeatStartNumber == 10 && p.SeatNumberingReversed && p.SeatName == "VIP"), "numbering settings apply to row group");
    await using (var numberingReload = Context())
        Check((await numberingReload.Placements.AsNoTracking().SingleAsync(p => p.Id == row.Id)).SeatStartNumber == 10, "numbering settings survive database reload");
    await Reject(() => service.Update(1, row.Id, new(row.Name, container.Id, 1, 5, IsRow: true, SeatStartNumber: 0)), "nonpositive seat start rejected");
    await Reject(() => service.Update(1, row.Id, new(row.Name, container.Id, 1, 5, IsRow: true, SeatStartNumber: int.MaxValue)), "seat number overflow rejected");
    await Reject(() => service.Update(1, row.Id, new(row.Name, container.Id, 1, 5, IsRow: true, SeatName: new string('x', 61))), "long seat name rejected");
    await service.SaveTemplate(1, "Rows template");
    var rowsTemplate = await db.PlacementTemplates.SingleAsync(t => t.Name == "Rows template");
    list = await service.ApplyTemplate(1, rowsTemplate.Id, true);
    var restoredContainer = list.Single(p => p.DisplayChildrenAsRows);
    Check(restoredContainer.Quota == null && list.Count(p => p.ParentId == restoredContainer.Id && p.Quota == 5) == 2, "template preserves row container and seats");
    Check(list.Count(p => p.IsLabel && p.Name == "Сцена") == 2, "template preserves label objects");
    Check(list.Any(p => p.IsRow && p.Rotation == 315), "template preserves row rotation");
    Check(list.Where(p => p.IsRow).All(p => p.SeatStartNumber == 10 && p.SeatNumberingReversed && p.SeatName == "VIP"), "template preserves row numbering settings");
    list = await service.Create(1, new("Numbered table", null, 1, 5, SeatStartNumber: 20, SeatNumberingReversed: true, SeatName: "Seat"));
    var numberedTable = list.Single(p => p.Name == "Numbered table");
    Check(numberedTable.SeatStartNumber == 20 && numberedTable.SeatNumberingReversed && numberedTable.SeatName == "Seat", "table numbering settings saved on create");
    list = await service.Update(1, numberedTable.Id, new(numberedTable.Name, null, 1, 5, SeatStartNumber: 30, SeatName: "VIP"));
    Check(list.Single(p => p.Id == numberedTable.Id).SeatStartNumber == 30 && !list.Single(p => p.Id == numberedTable.Id).SeatNumberingReversed, "table numbering settings saved on update");
    await using (var tableReload = Context())
        Check((await tableReload.Placements.AsNoTracking().SingleAsync(p => p.Id == numberedTable.Id)).SeatName == "VIP", "table numbering survives database reload");
    await Reject(() => service.Create(1, new("Invalid table", null, 1, 5, SeatStartNumber: 0)), "table rejects invalid numbering start");
    await service.SaveTemplate(1, "Numbered tables");
    var numberedTemplate = await db.PlacementTemplates.SingleAsync(t => t.Name == "Numbered tables");
    list = await service.ApplyTemplate(1, numberedTemplate.Id, true);
    Check(list.Single(p => p.Name == "Numbered table").SeatStartNumber == 30, "template preserves table numbering");
    Console.WriteLine($"Completed {checks} integration checks.");
}
finally
{
    await db.Database.EnsureDeletedAsync();
}
