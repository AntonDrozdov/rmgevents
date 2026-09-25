using Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations;

[DbContext(typeof(ApplicationDbContext))]
[Migration("20260925130000_AddGuestPublicId")]
public partial class AddGuestPublicId : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(name: "public_id", schema: "corebackend", table: "guests", type: "uuid", nullable: true);
        migrationBuilder.Sql("UPDATE corebackend.guests SET public_id = md5(random()::text || clock_timestamp()::text || id::text)::uuid WHERE public_id IS NULL;");
        migrationBuilder.AlterColumn<Guid>(name: "public_id", schema: "corebackend", table: "guests", type: "uuid", nullable: false, oldClrType: typeof(Guid), oldType: "uuid", oldNullable: true);
        migrationBuilder.CreateIndex(name: "IX_guests_public_id", schema: "corebackend", table: "guests", column: "public_id", unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "IX_guests_public_id", schema: "corebackend", table: "guests");
        migrationBuilder.DropColumn(name: "public_id", schema: "corebackend", table: "guests");
    }
}
