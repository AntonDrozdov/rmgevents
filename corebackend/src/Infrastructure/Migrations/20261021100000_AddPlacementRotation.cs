using Microsoft.EntityFrameworkCore.Migrations;
#nullable disable
namespace Infrastructure.Migrations;
public partial class AddPlacementRotation : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.AddColumn<int>(name: "rotation", schema: "corebackend", table: "placements", type: "integer", nullable: false, defaultValue: 0);
    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropColumn(name: "rotation", schema: "corebackend", table: "placements");
}
