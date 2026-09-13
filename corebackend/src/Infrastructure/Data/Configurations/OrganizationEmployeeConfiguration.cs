using Application.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Data.Configurations;

public sealed class OrganizationEmployeeConfiguration : IEntityTypeConfiguration<OrganizationEmployee>
{
    public void Configure(EntityTypeBuilder<OrganizationEmployee> builder)
    {
        builder.ToTable("organization_employees");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasColumnName("id")
            .ValueGeneratedOnAdd();

        builder.Property(x => x.DepartmentId)
            .HasColumnName("department_id")
            .IsRequired();

        builder.Property(x => x.FullName)
            .HasColumnName("full_name")
            .IsRequired()
            .HasMaxLength(512);

        builder.Property(x => x.Surname)
            .HasColumnName("surname")
            .HasMaxLength(255);

        builder.Property(x => x.Name)
            .HasColumnName("name")
            .HasMaxLength(255);

        builder.Property(x => x.AdditionalName)
            .HasColumnName("additional_name")
            .HasMaxLength(255);

        builder.Property(x => x.Position)
            .HasColumnName("position")
            .IsRequired()
            .HasMaxLength(512);

        builder.Property(x => x.SourceRowNumber)
            .HasColumnName("source_row_number")
            .IsRequired();

        builder.Property(x => x.CreatedAt)
            .HasColumnName("created_at");

        builder.HasOne(x => x.Department)
            .WithMany(x => x.Employees)
            .HasForeignKey(x => x.DepartmentId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(x => x.DepartmentId)
            .HasDatabaseName("IX_organization_employees_department_id");

        builder.HasIndex(x => x.FullName)
            .HasDatabaseName("IX_organization_employees_full_name");
    }
}
