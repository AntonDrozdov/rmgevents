using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlacements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "placement_id",
                schema: "corebackend",
                table: "guests",
                type: "bigint",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "placement_templates",
                schema: "corebackend",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Structure = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_placement_templates", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "placements",
                schema: "corebackend",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    event_id = table.Column<long>(type: "bigint", nullable: false),
                    parent_id = table.Column<long>(type: "bigint", nullable: true),
                    group_id = table.Column<long>(type: "bigint", nullable: true),
                    name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    quota = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_placements", x => x.id);
                    table.CheckConstraint("placement_quota_nonnegative", "quota IS NULL OR quota >= 0");
                    table.ForeignKey(
                        name: "FK_placements_events_event_id",
                        column: x => x.event_id,
                        principalSchema: "corebackend",
                        principalTable: "events",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_placements_groups_group_id",
                        column: x => x.group_id,
                        principalSchema: "corebackend",
                        principalTable: "groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_placements_placements_parent_id",
                        column: x => x.parent_id,
                        principalSchema: "corebackend",
                        principalTable: "placements",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_guests_placement_id",
                schema: "corebackend",
                table: "guests",
                column: "placement_id");

            migrationBuilder.CreateIndex(
                name: "IX_placements_event_id",
                schema: "corebackend",
                table: "placements",
                column: "event_id");

            migrationBuilder.CreateIndex(
                name: "IX_placements_group_id",
                schema: "corebackend",
                table: "placements",
                column: "group_id");

            migrationBuilder.CreateIndex(
                name: "IX_placements_parent_id",
                schema: "corebackend",
                table: "placements",
                column: "parent_id");

            migrationBuilder.AddForeignKey(
                name: "FK_guests_placements_placement_id",
                schema: "corebackend",
                table: "guests",
                column: "placement_id",
                principalSchema: "corebackend",
                principalTable: "placements",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_guests_placements_placement_id",
                schema: "corebackend",
                table: "guests");

            migrationBuilder.DropTable(
                name: "placement_templates",
                schema: "corebackend");

            migrationBuilder.DropTable(
                name: "placements",
                schema: "corebackend");

            migrationBuilder.DropIndex(
                name: "IX_guests_placement_id",
                schema: "corebackend",
                table: "guests");

            migrationBuilder.DropColumn(
                name: "placement_id",
                schema: "corebackend",
                table: "guests");
        }
    }
}
