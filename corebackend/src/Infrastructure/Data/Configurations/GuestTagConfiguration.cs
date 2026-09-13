using Application.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Data.Configurations;

public sealed class GuestTagConfiguration : IEntityTypeConfiguration<GuestTag>
{
    public void Configure(EntityTypeBuilder<GuestTag> builder)
    {
        builder.ToTable("guest_tags");

        builder.HasKey(x => new { x.GuestId, x.TagId });

        builder.Property(x => x.GuestId)
            .HasColumnName("guest_id");

        builder.Property(x => x.TagId)
            .HasColumnName("tag_id");

        builder.HasOne(x => x.Guest)
            .WithMany(x => x.GuestTags)
            .HasForeignKey(x => x.GuestId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(x => x.Tag)
            .WithMany(x => x.GuestTags)
            .HasForeignKey(x => x.TagId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(x => x.TagId)
            .HasDatabaseName("IX_guest_tags_tag_id");
    }
}
