using Application.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Data.Configurations;

public sealed class GroupConfiguration : IEntityTypeConfiguration<Group>
{
    public void Configure(EntityTypeBuilder<Group> builder)
    {
        builder.ToTable("groups");
        
        builder.HasKey(x => x.Id);
        
        builder.Property(x => x.Id)
            .HasColumnName("id")
            .ValueGeneratedNever();
        
        builder.Property(x => x.EventId)
            .HasColumnName("event_id")
            .IsRequired();
        
        builder.Property(x => x.ParentGroupId)
            .HasColumnName("parent_group_id");
        
        builder.Property(x => x.Name)
            .HasColumnName("name")
            .IsRequired()
            .HasMaxLength(255);
        
        builder.Property(x => x.Quota)
            .HasColumnName("quota")
            .IsRequired();
        
        builder.Property(x => x.CreatedAt)
            .HasColumnName("created_at");
        
        builder.HasIndex(x => new { x.EventId, x.Name })
            .IsUnique();
        
        builder.HasOne(x => x.Event)
            .WithMany(x => x.Groups)
            .HasForeignKey(x => x.EventId)
            .OnDelete(DeleteBehavior.Cascade);
        
        builder.HasOne(x => x.ParentGroup)
            .WithMany(x => x.ChildGroups)
            .HasForeignKey(x => x.ParentGroupId)
            .OnDelete(DeleteBehavior.Restrict);
        
        builder.HasMany(x => x.Users)
            .WithOne(x => x.Group)
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Restrict);
        
        builder.HasMany(x => x.Guests)
            .WithOne(x => x.Group)
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
