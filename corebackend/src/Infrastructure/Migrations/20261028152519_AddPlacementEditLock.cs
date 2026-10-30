using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlacementEditLock : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "placement_edit_locks",
                schema: "corebackend",
                columns: table => new
                {
                    event_id = table.Column<long>(type: "bigint", nullable: false),
                    user_id = table.Column<long>(type: "bigint", nullable: false),
                    token = table.Column<Guid>(type: "uuid", nullable: false),
                    acquired_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_placement_edit_locks", x => x.event_id);
                    table.ForeignKey(
                        name: "FK_placement_edit_locks_events_event_id",
                        column: x => x.event_id,
                        principalSchema: "corebackend",
                        principalTable: "events",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_placement_edit_locks_users_user_id",
                        column: x => x.user_id,
                        principalSchema: "corebackend",
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_placement_edit_locks_token",
                schema: "corebackend",
                table: "placement_edit_locks",
                column: "token",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_placement_edit_locks_user_id",
                schema: "corebackend",
                table: "placement_edit_locks",
                column: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "placement_edit_locks",
                schema: "corebackend");
        }
    }
}
