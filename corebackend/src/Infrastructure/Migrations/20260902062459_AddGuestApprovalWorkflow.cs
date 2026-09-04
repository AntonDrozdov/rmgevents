using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGuestApprovalWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "status",
                schema: "corebackend",
                table: "guests",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "pending",
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20,
                oldDefaultValue: "pending");

            migrationBuilder.CreateTable(
                name: "guest_decisions",
                schema: "corebackend",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    guest_id = table.Column<long>(type: "bigint", nullable: false),
                    actor_user_id = table.Column<long>(type: "bigint", nullable: true),
                    actor_name = table.Column<string>(type: "character varying(767)", maxLength: 767, nullable: false),
                    action = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_guest_decisions", x => x.id);
                    table.ForeignKey(
                        name: "FK_guest_decisions_guests_guest_id",
                        column: x => x.guest_id,
                        principalSchema: "corebackend",
                        principalTable: "guests",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_guest_decisions_users_actor_user_id",
                        column: x => x.actor_user_id,
                        principalSchema: "corebackend",
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_guest_decisions_actor_user_id",
                schema: "corebackend",
                table: "guest_decisions",
                column: "actor_user_id");

            migrationBuilder.CreateIndex(
                name: "IX_guest_decisions_guest_id_created_at",
                schema: "corebackend",
                table: "guest_decisions",
                columns: new[] { "guest_id", "created_at" });

            migrationBuilder.Sql(
                """
                INSERT INTO corebackend.guest_decisions
                    (guest_id, actor_user_id, actor_name, action, created_at)
                SELECT id, NULL, 'Система (перенос данных)', 'admin_approved', COALESCE(approved_at, created_at)
                FROM corebackend.guests
                WHERE status = 'approved';

                UPDATE corebackend.guests
                SET status = 'admin_approved'
                WHERE status = 'approved';

                INSERT INTO corebackend.guest_decisions
                    (guest_id, actor_user_id, actor_name, action, created_at)
                SELECT id, NULL, 'Система (перенос данных)', 'rejected', created_at
                FROM corebackend.guests
                WHERE status = 'rejected';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                UPDATE corebackend.guests
                SET status = 'approved'
                WHERE status IN ('reviewer_approved', 'admin_approved', 'invited');
                """);

            migrationBuilder.DropTable(
                name: "guest_decisions",
                schema: "corebackend");

            migrationBuilder.AlterColumn<string>(
                name: "status",
                schema: "corebackend",
                table: "guests",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "pending",
                oldClrType: typeof(string),
                oldType: "character varying(30)",
                oldMaxLength: 30,
                oldDefaultValue: "pending");
        }
    }
}
