using Application.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Data.Configurations;

public sealed class LoginConfiguration : IEntityTypeConfiguration<Login>
{
    public void Configure(EntityTypeBuilder<Login> builder)
    {
        builder.ToTable("logins");
        
        builder.HasKey(x => x.Id);
        
        builder.Property(x => x.Id)
            .HasColumnName("id")
            .ValueGeneratedNever();
        
        builder.Property(x => x.Username)
            .HasColumnName("username")
            .IsRequired()
            .HasMaxLength(255);
        
        builder.Property(x => x.PasswordHash)
            .HasColumnName("password_hash")
            .IsRequired();
        
        builder.Property(x => x.CreatedAt)
            .HasColumnName("created_at");
        
        builder.HasIndex(x => x.Username)
            .IsUnique();
        
        builder.HasMany(x => x.Users)
            .WithOne(x => x.Login)
            .HasForeignKey(x => x.LoginId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
