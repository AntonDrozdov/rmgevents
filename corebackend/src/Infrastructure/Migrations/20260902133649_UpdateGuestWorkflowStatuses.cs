using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UpdateGuestWorkflowStatuses : Migration
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
                defaultValue: "saved",
                oldClrType: typeof(string),
                oldType: "character varying(30)",
                oldMaxLength: 30,
                oldDefaultValue: "pending");

            migrationBuilder.Sql(
                """
                UPDATE corebackend.guests SET status = 'saved' WHERE status = 'pending';
                UPDATE corebackend.guests SET status = 'admin_review' WHERE status = 'reviewer_approved';
                UPDATE corebackend.guests SET status = 'approved' WHERE status = 'admin_approved';
                UPDATE corebackend.guest_decisions
                SET action = 'restored_to_saved'
                WHERE action = 'returned_to_review';

                INSERT INTO corebackend.guest_decisions
                    (guest_id, actor_user_id, actor_name, action, created_at)
                SELECT guest.id, NULL, 'Система (перенос данных)', 'submitted_for_review', guest.created_at
                FROM corebackend.guests AS guest
                WHERE EXISTS (
                    SELECT 1
                    FROM corebackend.guest_decisions AS decision
                    WHERE decision.guest_id = guest.id
                      AND decision.action IN ('reviewer_approved', 'admin_approved', 'invited')
                )
                AND NOT EXISTS (
                    SELECT 1
                    FROM corebackend.guest_decisions AS decision
                    WHERE decision.guest_id = guest.id
                      AND decision.action = 'submitted_for_review'
                );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                UPDATE corebackend.guests SET status = 'pending' WHERE status = 'saved';
                UPDATE corebackend.guests SET status = 'reviewer_approved' WHERE status = 'admin_review';
                UPDATE corebackend.guests SET status = 'admin_approved' WHERE status = 'approved';
                UPDATE corebackend.guest_decisions
                SET action = 'returned_to_review'
                WHERE action = 'restored_to_saved';
                """);

            migrationBuilder.AlterColumn<string>(
                name: "status",
                schema: "corebackend",
                table: "guests",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "pending",
                oldClrType: typeof(string),
                oldType: "character varying(30)",
                oldMaxLength: 30,
                oldDefaultValue: "saved");
        }
    }
}
