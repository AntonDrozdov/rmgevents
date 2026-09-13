using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddOrganizationStructure : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "organization_departments",
                schema: "corebackend",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    parent_id = table.Column<long>(type: "bigint", nullable: true),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    normalized_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    source_parent_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    source_row_number = table.Column<int>(type: "integer", nullable: true),
                    is_generated_from_parent_name = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_organization_departments", x => x.id);
                    table.ForeignKey(
                        name: "FK_organization_departments_organization_departments_parent_id",
                        column: x => x.parent_id,
                        principalSchema: "corebackend",
                        principalTable: "organization_departments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "organization_employees",
                schema: "corebackend",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    department_id = table.Column<long>(type: "bigint", nullable: false),
                    full_name = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    surname = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    additional_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    position = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    source_row_number = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_organization_employees", x => x.id);
                    table.ForeignKey(
                        name: "FK_organization_employees_organization_departments_department_~",
                        column: x => x.department_id,
                        principalSchema: "corebackend",
                        principalTable: "organization_departments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_organization_departments_normalized_name",
                schema: "corebackend",
                table: "organization_departments",
                column: "normalized_name");

            migrationBuilder.CreateIndex(
                name: "IX_organization_departments_parent_id",
                schema: "corebackend",
                table: "organization_departments",
                column: "parent_id");

            migrationBuilder.CreateIndex(
                name: "IX_organization_employees_department_id",
                schema: "corebackend",
                table: "organization_employees",
                column: "department_id");

            migrationBuilder.CreateIndex(
                name: "IX_organization_employees_full_name",
                schema: "corebackend",
                table: "organization_employees",
                column: "full_name");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "organization_employees",
                schema: "corebackend");

            migrationBuilder.DropTable(
                name: "organization_departments",
                schema: "corebackend");
        }
    }
}
