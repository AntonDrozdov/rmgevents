using Microsoft.EntityFrameworkCore.Migrations;
#nullable disable
namespace Infrastructure.Migrations;
public partial class AddPlacementFontSize : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.AddColumn<int>(name: "font_size", schema: "corebackend", table: "placements", type: "integer", nullable: true);
    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropColumn(name: "font_size", schema: "corebackend", table: "placements");
}
