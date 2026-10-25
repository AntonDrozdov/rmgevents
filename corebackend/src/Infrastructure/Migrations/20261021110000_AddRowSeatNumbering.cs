using Microsoft.EntityFrameworkCore.Migrations;
#nullable disable
namespace Infrastructure.Migrations;
public partial class AddRowSeatNumbering : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(name: "seat_start_number", schema: "corebackend", table: "placements", type: "integer", nullable: false, defaultValue: 1);
        migrationBuilder.AddColumn<bool>(name: "seat_numbering_reversed", schema: "corebackend", table: "placements", type: "boolean", nullable: false, defaultValue: false);
        migrationBuilder.AddColumn<string>(name: "seat_name", schema: "corebackend", table: "placements", type: "character varying(60)", maxLength: 60, nullable: true);
    }
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "seat_start_number", schema: "corebackend", table: "placements");
        migrationBuilder.DropColumn(name: "seat_numbering_reversed", schema: "corebackend", table: "placements");
        migrationBuilder.DropColumn(name: "seat_name", schema: "corebackend", table: "placements");
    }
}
