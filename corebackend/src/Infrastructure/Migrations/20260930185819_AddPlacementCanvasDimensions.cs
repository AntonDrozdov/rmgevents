using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlacementCanvasDimensions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "canvas_height",
                schema: "corebackend",
                table: "placements",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "canvas_width",
                schema: "corebackend",
                table: "placements",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "canvas_height",
                schema: "corebackend",
                table: "placements");

            migrationBuilder.DropColumn(
                name: "canvas_width",
                schema: "corebackend",
                table: "placements");
        }
    }
}
