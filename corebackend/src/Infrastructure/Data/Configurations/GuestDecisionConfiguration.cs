using Application.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Data.Configurations;

public sealed class GuestDecisionConfiguration : IEntityTypeConfiguration<GuestDecision>
{
    public void Configure(EntityTypeBuilder<GuestDecision> builder)
    {
        builder.ToTable("guest_decisions");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        builder.Property(x => x.GuestId).HasColumnName("guest_id").IsRequired();
        builder.Property(x => x.ActorUserId).HasColumnName("actor_user_id");
        builder.Property(x => x.ActorName).HasColumnName("actor_name").HasMaxLength(767).IsRequired();
        builder.Property(x => x.Action).HasColumnName("action").HasMaxLength(30).IsRequired();
        builder.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();

        builder.HasIndex(x => new { x.GuestId, x.CreatedAt });

        builder.HasOne(x => x.Guest)
            .WithMany(x => x.Decisions)
            .HasForeignKey(x => x.GuestId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(x => x.ActorUser)
            .WithMany(x => x.GuestDecisions)
            .HasForeignKey(x => x.ActorUserId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
