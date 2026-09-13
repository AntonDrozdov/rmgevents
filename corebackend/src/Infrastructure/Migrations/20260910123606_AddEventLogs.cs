using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEventLogs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "event_logs",
                schema: "corebackend",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    event_id = table.Column<long>(type: "bigint", nullable: false),
                    user_id = table.Column<long>(type: "bigint", nullable: true),
                    actor_name = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    actor_role_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    action = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    entity_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    entity_id = table.Column<long>(type: "bigint", nullable: true),
                    title = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_event_logs", x => x.id);
                    table.ForeignKey(
                        name: "FK_event_logs_events_event_id",
                        column: x => x.event_id,
                        principalSchema: "corebackend",
                        principalTable: "events",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_event_logs_users_user_id",
                        column: x => x.user_id,
                        principalSchema: "corebackend",
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_event_logs_event_id_action_created_at",
                schema: "corebackend",
                table: "event_logs",
                columns: new[] { "event_id", "action", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_event_logs_event_id_created_at",
                schema: "corebackend",
                table: "event_logs",
                columns: new[] { "event_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_event_logs_event_id_entity_type_created_at",
                schema: "corebackend",
                table: "event_logs",
                columns: new[] { "event_id", "entity_type", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_event_logs_event_id_user_id_created_at",
                schema: "corebackend",
                table: "event_logs",
                columns: new[] { "event_id", "user_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_event_logs_user_id",
                schema: "corebackend",
                table: "event_logs",
                column: "user_id");

            migrationBuilder.Sql("""
                INSERT INTO corebackend.event_logs (
                    event_id,
                    user_id,
                    actor_name,
                    actor_role_name,
                    action,
                    entity_type,
                    entity_id,
                    title,
                    description,
                    created_at)
                SELECT
                    e.id,
                    e.owner_id,
                    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.surname, u.name, u.additional_name)), ''), 'Система'),
                    r.name,
                    'created',
                    'Event',
                    e.id,
                    'Создано мероприятие',
                    CONCAT('Мероприятие: ', e.name),
                    e.created_at
                FROM corebackend.events e
                LEFT JOIN corebackend.users u ON u.id = e.owner_id
                LEFT JOIN corebackend.roles r ON r.id = u.role_id
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM corebackend.event_logs l
                    WHERE l.event_id = e.id
                      AND l.entity_type = 'Event'
                      AND l.entity_id = e.id
                      AND l.action = 'created'
                );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "event_logs",
                schema: "corebackend");
        }
    }
}
