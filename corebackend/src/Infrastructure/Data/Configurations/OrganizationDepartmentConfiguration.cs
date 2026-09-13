using Application.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Data.Configurations;

public sealed class OrganizationDepartmentConfiguration : IEntityTypeConfiguration<OrganizationDepartment>
{
    public void Configure(EntityTypeBuilder<OrganizationDepartment> builder)
    {
        builder.ToTable("organization_departments");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasColumnName("id")
            .ValueGeneratedOnAdd();

        builder.Property(x => x.ParentId)
            .HasColumnName("parent_id");

        builder.Property(x => x.Name)
            .HasColumnName("name")
            .IsRequired()
            .HasMaxLength(255);

        builder.Property(x => x.NormalizedName)
            .HasColumnName("normalized_name")
            .IsRequired()
            .HasMaxLength(255);

        builder.Property(x => x.SourceParentName)
            .HasColumnName("source_parent_name")
            .HasMaxLength(255);

        builder.Property(x => x.SourceRowNumber)
            .HasColumnName("source_row_number");

        builder.Property(x => x.IsGeneratedFromParentName)
            .HasColumnName("is_generated_from_parent_name")
            .IsRequired();

        builder.Property(x => x.CreatedAt)
            .HasColumnName("created_at");

        builder.HasOne(x => x.Parent)
            .WithMany(x => x.Children)
            .HasForeignKey(x => x.ParentId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(x => x.ParentId)
            .HasDatabaseName("IX_organization_departments_parent_id");

        builder.HasIndex(x => x.NormalizedName)
            .HasDatabaseName("IX_organization_departments_normalized_name");
    }
}
