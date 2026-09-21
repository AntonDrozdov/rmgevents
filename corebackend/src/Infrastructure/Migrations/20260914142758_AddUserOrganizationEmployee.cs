using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUserOrganizationEmployee : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "organization_employee_id",
                schema: "corebackend",
                table: "users",
                type: "bigint",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_users_organization_employee_id",
                schema: "corebackend",
                table: "users",
                column: "organization_employee_id");

            migrationBuilder.AddForeignKey(
                name: "FK_users_organization_employees_organization_employee_id",
                schema: "corebackend",
                table: "users",
                column: "organization_employee_id",
                principalSchema: "corebackend",
                principalTable: "organization_employees",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_users_organization_employees_organization_employee_id",
                schema: "corebackend",
                table: "users");

            migrationBuilder.DropIndex(
                name: "IX_users_organization_employee_id",
                schema: "corebackend",
                table: "users");

            migrationBuilder.DropColumn(
                name: "organization_employee_id",
                schema: "corebackend",
                table: "users");
        }
    }
}
