using Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations;

[DbContext(typeof(ApplicationDbContext))]
[Migration("20260925120000_AddPlacementSeatNumbers")]
public partial class AddPlacementSeatNumbers : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(name: "placement_seat_number", schema: "corebackend", table: "guests", type: "integer", nullable: true);
        migrationBuilder.Sql("""
            WITH ranked AS (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY placement_id ORDER BY id)::integer AS seat_number
                FROM corebackend.guests
                WHERE placement_id IS NOT NULL
            )
            UPDATE corebackend.guests AS guest
            SET placement_seat_number = ranked.seat_number
            FROM ranked
            WHERE guest.id = ranked.id;
            """);
        migrationBuilder.CreateIndex(name: "IX_guests_placement_id_placement_seat_number", schema: "corebackend", table: "guests", columns: new[] { "placement_id", "placement_seat_number" }, unique: true, filter: "placement_id IS NOT NULL AND placement_seat_number IS NOT NULL");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "IX_guests_placement_id_placement_seat_number", schema: "corebackend", table: "guests");
        migrationBuilder.DropColumn(name: "placement_seat_number", schema: "corebackend", table: "guests");
    }
}
