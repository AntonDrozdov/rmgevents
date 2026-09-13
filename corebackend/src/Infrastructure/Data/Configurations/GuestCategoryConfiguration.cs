using Application.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Data.Configurations;

public sealed class GuestCategoryConfiguration : IEntityTypeConfiguration<GuestCategory>
{
    public void Configure(EntityTypeBuilder<GuestCategory> builder)
    {
        builder.ToTable("guest_categories");

        builder.HasKey(x => x.GuestId);

        builder.Property(x => x.GuestId)
            .HasColumnName("guest_id");

        builder.Property(x => x.CategoryId)
            .HasColumnName("category_id");

        builder.HasOne(x => x.Guest)
            .WithOne(x => x.GuestCategory)
            .HasForeignKey<GuestCategory>(x => x.GuestId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(x => x.Category)
            .WithMany(x => x.GuestCategories)
            .HasForeignKey(x => x.CategoryId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(x => x.CategoryId)
            .HasDatabaseName("IX_guest_categories_category_id");
    }
}
