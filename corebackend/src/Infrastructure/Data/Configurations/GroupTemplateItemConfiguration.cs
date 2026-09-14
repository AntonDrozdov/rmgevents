using Application.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Data.Configurations;

public sealed class GroupTemplateItemConfiguration : IEntityTypeConfiguration<GroupTemplateItem>
{
    public void Configure(EntityTypeBuilder<GroupTemplateItem> builder)
    {
        builder.ToTable("group_template_items");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasColumnName("id")
            .ValueGeneratedOnAdd();

        builder.Property(x => x.TemplateId)
            .HasColumnName("template_id")
            .IsRequired();

        builder.Property(x => x.ParentItemId)
            .HasColumnName("parent_item_id");

        builder.Property(x => x.Name)
            .HasColumnName("name")
            .IsRequired()
            .HasMaxLength(255);

        builder.Property(x => x.Quota)
            .HasColumnName("quota")
            .IsRequired();

        builder.Property(x => x.SortOrder)
            .HasColumnName("sort_order")
            .IsRequired();

        builder.HasIndex(x => x.TemplateId);
        builder.HasIndex(x => x.ParentItemId);

        builder.HasOne(x => x.Template)
            .WithMany(x => x.Items)
            .HasForeignKey(x => x.TemplateId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(x => x.ParentItem)
            .WithMany(x => x.ChildItems)
            .HasForeignKey(x => x.ParentItemId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
