using Application.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Data.Configurations;

public sealed class ImageEntityConfiguration : IEntityTypeConfiguration<ImageEntity>
{
    public void Configure(EntityTypeBuilder<ImageEntity> builder)
    {
        builder.ToTable("images");

        builder.HasKey(image => image.Id);
        builder.Property(image => image.Id).ValueGeneratedNever();
        builder.Property(image => image.FileName).HasMaxLength(255).IsRequired();
        builder.Property(image => image.ContentType).HasMaxLength(100).IsRequired();
        builder.Property(image => image.Data).HasColumnType("bytea").IsRequired();
        builder.Property(image => image.AltText).HasMaxLength(500);
        builder.Property(image => image.CreatedAt)
            .HasDefaultValueSql("CURRENT_TIMESTAMP")
            .IsRequired();
    }
}
