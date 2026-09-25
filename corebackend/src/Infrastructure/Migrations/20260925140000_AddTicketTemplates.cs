using Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
#nullable disable
namespace Infrastructure.Migrations;
[DbContext(typeof(ApplicationDbContext))]
[Migration("20260925140000_AddTicketTemplates")]
public partial class AddTicketTemplates : Migration
{
 protected override void Up(MigrationBuilder m) { m.CreateTable(name:"ticket_templates",schema:"corebackend",columns:t=>new { id=t.Column<long>(type:"bigint",nullable:false).Annotation("Npgsql:ValueGenerationStrategy",Npgsql.EntityFrameworkCore.PostgreSQL.Metadata.NpgsqlValueGenerationStrategy.IdentityByDefaultColumn), event_id=t.Column<long>(type:"bigint",nullable:false), name=t.Column<string>(type:"character varying(120)",maxLength:120,nullable:false), background_image_id=t.Column<long>(type:"bigint",nullable:false), qr_x=t.Column<int>(type:"integer",nullable:false), qr_y=t.Column<int>(type:"integer",nullable:false), qr_size=t.Column<int>(type:"integer",nullable:false), qr_radius=t.Column<int>(type:"integer",nullable:false), is_default=t.Column<bool>(type:"boolean",nullable:false)},constraints:t=>{t.PrimaryKey("PK_ticket_templates",x=>x.id);t.ForeignKey("FK_ticket_templates_events_event_id",x=>x.event_id,principalSchema:"corebackend",principalTable:"events",principalColumn:"id",onDelete:ReferentialAction.Cascade);t.ForeignKey("FK_ticket_templates_images_background_image_id",x=>x.background_image_id,principalSchema:"corebackend",principalTable:"images",principalColumn:"Id",onDelete:ReferentialAction.Restrict);});m.CreateIndex(name:"IX_ticket_templates_event_id",schema:"corebackend",table:"ticket_templates",column:"event_id");m.CreateIndex(name:"IX_ticket_templates_background_image_id",schema:"corebackend",table:"ticket_templates",column:"background_image_id"); }
 protected override void Down(MigrationBuilder m)=>m.DropTable(name:"ticket_templates",schema:"corebackend");
}
