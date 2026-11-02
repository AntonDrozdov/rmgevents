using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations;

[DbContext(typeof(ApplicationDbContext))]
[Migration("20261102090000_AddGuestCompanions")]
public sealed class AddGuestCompanions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<long>(
            name: "parent_guest_id",
            schema: "corebackend",
            table: "guests",
            type: "bigint",
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "IX_guests_parent_guest_id",
            schema: "corebackend",
            table: "guests",
            column: "parent_guest_id");

        migrationBuilder.AddForeignKey(
            name: "FK_guests_guests_parent_guest_id",
            schema: "corebackend",
            table: "guests",
            column: "parent_guest_id",
            principalSchema: "corebackend",
            principalTable: "guests",
            principalColumn: "id",
            onDelete: ReferentialAction.Restrict);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(
            name: "FK_guests_guests_parent_guest_id",
            schema: "corebackend",
            table: "guests");

        migrationBuilder.DropIndex(
            name: "IX_guests_parent_guest_id",
            schema: "corebackend",
            table: "guests");

        migrationBuilder.DropColumn(
            name: "parent_guest_id",
            schema: "corebackend",
            table: "guests");
    }
}
