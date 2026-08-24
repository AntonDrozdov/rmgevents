using Application.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Data.Configurations;

public sealed class CategoryConfiguration : IEntityTypeConfiguration<Category>
{
    public void Configure(EntityTypeBuilder<Category> builder)
    {
        builder.ToTable("categories");
        builder.HasKey(category => category.Id);
        builder.Property(category => category.Id).ValueGeneratedNever();
        builder.Property(category => category.Name).HasMaxLength(200).IsRequired();
        builder.Property(category => category.Description).HasMaxLength(2000).IsRequired();
        builder.Property(category => category.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP").IsRequired();
        builder.HasOne<ImageEntity>().WithMany().HasForeignKey(category => category.ImageId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(category => category.Products).WithOne().HasForeignKey(product => product.CategoryId).OnDelete(DeleteBehavior.Cascade);
    }
}
