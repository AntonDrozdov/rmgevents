using Application.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Data.Configurations;

public sealed class PlacementConfiguration : IEntityTypeConfiguration<Placement>
{
    public void Configure(EntityTypeBuilder<Placement> b)
    {
        b.ToTable("placements", t => t.HasCheckConstraint("placement_quota_nonnegative", "quota IS NULL OR quota >= 0"));
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.EventId).HasColumnName("event_id");
        b.Property(x => x.ParentId).HasColumnName("parent_id");
        b.Property(x => x.GroupId).HasColumnName("group_id");
        b.Property(x => x.Name).HasColumnName("name").HasMaxLength(150);
        b.Property(x => x.Quota).HasColumnName("quota");
        b.Property(x => x.DisplayChildrenAsRows).HasColumnName("display_children_as_rows").HasDefaultValue(false);
        b.HasOne<Event>().WithMany().HasForeignKey(x => x.EventId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Placement>().WithMany().HasForeignKey(x => x.ParentId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Group>().WithMany().HasForeignKey(x => x.GroupId).OnDelete(DeleteBehavior.SetNull);
    }
}

public sealed class PlacementTemplateConfiguration : IEntityTypeConfiguration<PlacementTemplate>
{
    public void Configure(EntityTypeBuilder<PlacementTemplate> b)
    {
        b.ToTable("placement_templates");
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(150);
        b.Property(x => x.Structure).HasColumnType("jsonb");
    }
}
