using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGuestSoftDelete : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "deleted_at",
                schema: "corebackend",
                table: "guests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "deleted_by_user_id",
                schema: "corebackend",
                table: "guests",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_deleted",
                schema: "corebackend",
                table: "guests",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_guests_deleted_by_user_id",
                schema: "corebackend",
                table: "guests",
                column: "deleted_by_user_id");

            migrationBuilder.CreateIndex(
                name: "IX_guests_event_id_is_deleted",
                schema: "corebackend",
                table: "guests",
                columns: new[] { "event_id", "is_deleted" });

            migrationBuilder.AddForeignKey(
                name: "FK_guests_users_deleted_by_user_id",
                schema: "corebackend",
                table: "guests",
                column: "deleted_by_user_id",
                principalSchema: "corebackend",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_guests_users_deleted_by_user_id",
                schema: "corebackend",
                table: "guests");

            migrationBuilder.DropIndex(
                name: "IX_guests_deleted_by_user_id",
                schema: "corebackend",
                table: "guests");

            migrationBuilder.DropIndex(
                name: "IX_guests_event_id_is_deleted",
                schema: "corebackend",
                table: "guests");

            migrationBuilder.DropColumn(
                name: "deleted_at",
                schema: "corebackend",
                table: "guests");

            migrationBuilder.DropColumn(
                name: "deleted_by_user_id",
                schema: "corebackend",
                table: "guests");

            migrationBuilder.DropColumn(
                name: "is_deleted",
                schema: "corebackend",
                table: "guests");
        }
    }
}
