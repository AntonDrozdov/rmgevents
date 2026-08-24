using Application.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Data.Configurations;

public sealed class ProductConfiguration : IEntityTypeConfiguration<Product>
{
    public void Configure(EntityTypeBuilder<Product> builder)
    {
        builder.ToTable("products");
        builder.HasKey(product => product.Id);
        builder.Property(product => product.Id).ValueGeneratedNever();
        builder.Property(product => product.Name).HasMaxLength(200).IsRequired();
        builder.Property(product => product.Description).HasMaxLength(4000).IsRequired();
        builder.Property(product => product.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP").IsRequired();
        builder.HasOne<ImageEntity>().WithMany().HasForeignKey(product => product.ImageId).OnDelete(DeleteBehavior.Restrict);
    }
}
