using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlacementCanvasPositions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "canvas_x",
                schema: "corebackend",
                table: "placements",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "canvas_y",
                schema: "corebackend",
                table: "placements",
                type: "integer",
                nullable: true);

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "canvas_x",
                schema: "corebackend",
                table: "placements");

            migrationBuilder.DropColumn(
                name: "canvas_y",
                schema: "corebackend",
                table: "placements");

        }
    }
}
