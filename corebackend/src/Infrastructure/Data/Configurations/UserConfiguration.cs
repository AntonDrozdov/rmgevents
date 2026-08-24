using Application.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Data.Configurations;

public sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("users");
        
        builder.HasKey(x => x.Id);
        
        builder.Property(x => x.Id)
            .HasColumnName("id")
            .ValueGeneratedNever();
        
        builder.Property(x => x.LoginId)
            .HasColumnName("login_id")
            .IsRequired();
        
        builder.Property(x => x.EventId)
            .HasColumnName("event_id")
            .IsRequired();
        
        builder.Property(x => x.RoleId)
            .HasColumnName("role_id")
            .IsRequired();
        
        builder.Property(x => x.GroupId)
            .HasColumnName("group_id")
            .IsRequired();
        
        builder.Property(x => x.DisplayName)
            .HasColumnName("display_name")
            .IsRequired()
            .HasMaxLength(255);
        
        builder.Property(x => x.Meta)
            .HasColumnName("meta")
            .HasColumnType("jsonb");
        
        builder.Property(x => x.CreatedAt)
            .HasColumnName("created_at");
        
        builder.HasIndex(x => new { x.LoginId, x.EventId })
            .IsUnique();
        
        builder.HasOne(x => x.Login)
            .WithMany(x => x.Users)
            .HasForeignKey(x => x.LoginId)
            .OnDelete(DeleteBehavior.Cascade);
        
        builder.HasOne(x => x.Event)
            .WithMany(x => x.Users)
            .HasForeignKey(x => x.EventId)
            .OnDelete(DeleteBehavior.Cascade);
        
        builder.HasOne(x => x.Role)
            .WithMany(x => x.Users)
            .HasForeignKey(x => x.RoleId)
            .OnDelete(DeleteBehavior.Restrict);
        
        builder.HasOne(x => x.Group)
            .WithMany(x => x.Users)
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Restrict);
        
        builder.HasMany(x => x.CreatedGuests)
            .WithOne(x => x.CreatedByUser)
            .HasForeignKey(x => x.CreatedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
