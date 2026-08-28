using Application.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Data.Configurations;

public sealed class EventConfiguration : IEntityTypeConfiguration<Event>
{
    public void Configure(EntityTypeBuilder<Event> builder)
    {
        builder.ToTable("events");
        
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

        builder.Property(x => x.LogoImageId)
            .HasColumnName("logo_image_id");
        
        builder.Property(x => x.OwnerId)
            .HasColumnName("owner_id")
            .IsRequired();
        
        builder.Property(x => x.CreatedAt)
            .HasColumnName("created_at");
        
        builder.Property(x => x.IsArchived)
            .HasColumnName("is_archived")
            .HasDefaultValue(false);

        builder.HasIndex(x => x.LogoImageId);

        builder.HasOne(x => x.LogoImage)
            .WithMany(x => x.LogoEvents)
            .HasForeignKey(x => x.LogoImageId)
            .OnDelete(DeleteBehavior.SetNull);
        
        builder.HasOne(x => x.Owner)
            .WithMany(x => x.OwnedEvents)
            .HasForeignKey(x => x.OwnerId)
            .OnDelete(DeleteBehavior.Restrict);
        
        builder.HasMany(x => x.Roles)
            .WithOne(x => x.Event)
            .HasForeignKey(x => x.EventId)
            .OnDelete(DeleteBehavior.Cascade);
        
        builder.HasMany(x => x.Groups)
            .WithOne(x => x.Event)
            .HasForeignKey(x => x.EventId)
            .OnDelete(DeleteBehavior.Cascade);
        
        builder.HasMany(x => x.Users)
            .WithOne(x => x.Event)
            .HasForeignKey(x => x.EventId)
            .OnDelete(DeleteBehavior.Cascade);
        
        builder.HasMany(x => x.Guests)
            .WithOne(x => x.Event)
            .HasForeignKey(x => x.EventId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
