using Application.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Data.Configurations;

public sealed class PlacementEditLockConfiguration : IEntityTypeConfiguration<PlacementEditLock>
{
    public void Configure(EntityTypeBuilder<PlacementEditLock> builder)
    {
        builder.ToTable("placement_edit_locks");
        builder.HasKey(x => x.EventId);
        builder.Property(x => x.EventId).HasColumnName("event_id");
        builder.Property(x => x.UserId).HasColumnName("user_id");
        builder.Property(x => x.Token).HasColumnName("token");
        builder.Property(x => x.AcquiredAt).HasColumnName("acquired_at");
        builder.Property(x => x.ExpiresAt).HasColumnName("expires_at");
        builder.HasIndex(x => x.UserId);
        builder.HasIndex(x => x.Token).IsUnique();
        builder.HasOne<Event>().WithOne().HasForeignKey<PlacementEditLock>(x => x.EventId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
