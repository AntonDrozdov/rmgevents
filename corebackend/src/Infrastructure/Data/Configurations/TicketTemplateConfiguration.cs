using Application.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Data.Configurations;
public sealed class TicketTemplateConfiguration : IEntityTypeConfiguration<TicketTemplate>
{
    public void Configure(EntityTypeBuilder<TicketTemplate> builder)
    {
        builder.ToTable("ticket_templates"); builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        builder.Property(x => x.EventId).HasColumnName("event_id"); builder.Property(x => x.Name).HasColumnName("name").HasMaxLength(120).IsRequired();
        builder.Property(x => x.BackgroundImageId).HasColumnName("background_image_id"); builder.Property(x => x.QrX).HasColumnName("qr_x"); builder.Property(x => x.QrY).HasColumnName("qr_y"); builder.Property(x => x.QrSize).HasColumnName("qr_size"); builder.Property(x => x.QrRadius).HasColumnName("qr_radius"); builder.Property(x => x.IsDefault).HasColumnName("is_default");
        builder.HasIndex(x => x.EventId); builder.HasOne(x => x.Event).WithMany().HasForeignKey(x => x.EventId).OnDelete(DeleteBehavior.Cascade); builder.HasOne(x => x.BackgroundImage).WithMany().HasForeignKey(x => x.BackgroundImageId).OnDelete(DeleteBehavior.Restrict);
    }
}
