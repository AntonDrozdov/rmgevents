using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEventCategories : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_users_event_id",
                schema: "corebackend",
                table: "users");

            migrationBuilder.DropIndex(
                name: "IX_guests_event_id",
                schema: "corebackend",
                table: "guests");

            migrationBuilder.CreateTable(
                name: "categories",
                schema: "corebackend",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    event_id = table.Column<long>(type: "bigint", nullable: false),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    color = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_categories", x => x.id);
                    table.ForeignKey(
                        name: "FK_categories_events_event_id",
                        column: x => x.event_id,
                        principalSchema: "corebackend",
                        principalTable: "events",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "guest_categories",
                schema: "corebackend",
                columns: table => new
                {
                    guest_id = table.Column<long>(type: "bigint", nullable: false),
                    category_id = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_guest_categories", x => x.guest_id);
                    table.ForeignKey(
                        name: "FK_guest_categories_categories_category_id",
                        column: x => x.category_id,
                        principalSchema: "corebackend",
                        principalTable: "categories",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_guest_categories_guests_guest_id",
                        column: x => x.guest_id,
                        principalSchema: "corebackend",
                        principalTable: "guests",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_categories_event_id_name",
                schema: "corebackend",
                table: "categories",
                columns: new[] { "event_id", "name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_guest_categories_category_id",
                schema: "corebackend",
                table: "guest_categories",
                column: "category_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "guest_categories",
                schema: "corebackend");

            migrationBuilder.DropTable(
                name: "categories",
                schema: "corebackend");

            migrationBuilder.CreateIndex(
                name: "IX_users_event_id",
                schema: "corebackend",
                table: "users",
                column: "event_id");

            migrationBuilder.CreateIndex(
                name: "IX_guests_event_id",
                schema: "corebackend",
                table: "guests",
                column: "event_id");
        }
    }
}
