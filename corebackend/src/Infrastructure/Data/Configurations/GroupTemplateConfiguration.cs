using Application.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Data.Configurations;

public sealed class GroupTemplateConfiguration : IEntityTypeConfiguration<GroupTemplate>
{
    public void Configure(EntityTypeBuilder<GroupTemplate> builder)
    {
        builder.ToTable("group_templates");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasColumnName("id")
            .ValueGeneratedOnAdd();

        builder.Property(x => x.Name)
            .HasColumnName("name")
            .IsRequired()
            .HasMaxLength(255);

        builder.Property(x => x.Description)
            .HasColumnName("description")
            .HasMaxLength(2000);

        builder.Property(x => x.CreatedByLoginId)
            .HasColumnName("created_by_login_id")
            .IsRequired();

        builder.Property(x => x.CreatedAt)
            .HasColumnName("created_at")
            .IsRequired();

        builder.HasIndex(x => x.CreatedAt);
        builder.HasIndex(x => x.CreatedByLoginId);

        builder.HasOne(x => x.CreatedByLogin)
            .WithMany()
            .HasForeignKey(x => x.CreatedByLoginId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
