using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupTemplates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "group_templates",
                schema: "corebackend",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    created_by_login_id = table.Column<long>(type: "bigint", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_group_templates", x => x.id);
                    table.ForeignKey(
                        name: "FK_group_templates_logins_created_by_login_id",
                        column: x => x.created_by_login_id,
                        principalSchema: "corebackend",
                        principalTable: "logins",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "group_template_items",
                schema: "corebackend",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    template_id = table.Column<long>(type: "bigint", nullable: false),
                    parent_item_id = table.Column<long>(type: "bigint", nullable: true),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    quota = table.Column<int>(type: "integer", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_group_template_items", x => x.id);
                    table.ForeignKey(
                        name: "FK_group_template_items_group_template_items_parent_item_id",
                        column: x => x.parent_item_id,
                        principalSchema: "corebackend",
                        principalTable: "group_template_items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_group_template_items_group_templates_template_id",
                        column: x => x.template_id,
                        principalSchema: "corebackend",
                        principalTable: "group_templates",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_group_template_items_parent_item_id",
                schema: "corebackend",
                table: "group_template_items",
                column: "parent_item_id");

            migrationBuilder.CreateIndex(
                name: "IX_group_template_items_template_id",
                schema: "corebackend",
                table: "group_template_items",
                column: "template_id");

            migrationBuilder.CreateIndex(
                name: "IX_group_templates_created_at",
                schema: "corebackend",
                table: "group_templates",
                column: "created_at");

            migrationBuilder.CreateIndex(
                name: "IX_group_templates_created_by_login_id",
                schema: "corebackend",
                table: "group_templates",
                column: "created_by_login_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "group_template_items",
                schema: "corebackend");

            migrationBuilder.DropTable(
                name: "group_templates",
                schema: "corebackend");
        }
    }
}
