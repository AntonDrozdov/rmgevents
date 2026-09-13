using Application.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Data.Configurations;

public sealed class EventLogConfiguration : IEntityTypeConfiguration<EventLog>
{
    public void Configure(EntityTypeBuilder<EventLog> builder)
    {
        builder.ToTable("event_logs");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasColumnName("id")
            .ValueGeneratedOnAdd();

        builder.Property(x => x.EventId)
            .HasColumnName("event_id")
            .IsRequired();

        builder.Property(x => x.UserId)
            .HasColumnName("user_id");

        builder.Property(x => x.ActorName)
            .HasColumnName("actor_name")
            .IsRequired()
            .HasMaxLength(512);

        builder.Property(x => x.ActorRoleName)
            .HasColumnName("actor_role_name")
            .HasMaxLength(255);

        builder.Property(x => x.Action)
            .HasColumnName("action")
            .IsRequired()
            .HasMaxLength(64);

        builder.Property(x => x.EntityType)
            .HasColumnName("entity_type")
            .IsRequired()
            .HasMaxLength(64);

        builder.Property(x => x.EntityId)
            .HasColumnName("entity_id");

        builder.Property(x => x.Title)
            .HasColumnName("title")
            .IsRequired()
            .HasMaxLength(255);

        builder.Property(x => x.Description)
            .HasColumnName("description")
            .HasMaxLength(2000);

        builder.Property(x => x.CreatedAt)
            .HasColumnName("created_at");

        builder.HasOne(x => x.Event)
            .WithMany(x => x.Logs)
            .HasForeignKey(x => x.EventId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(x => new { x.EventId, x.CreatedAt })
            .HasDatabaseName("IX_event_logs_event_id_created_at");

        builder.HasIndex(x => new { x.EventId, x.UserId, x.CreatedAt })
            .HasDatabaseName("IX_event_logs_event_id_user_id_created_at");

        builder.HasIndex(x => new { x.EventId, x.Action, x.CreatedAt })
            .HasDatabaseName("IX_event_logs_event_id_action_created_at");

        builder.HasIndex(x => new { x.EventId, x.EntityType, x.CreatedAt })
            .HasDatabaseName("IX_event_logs_event_id_entity_type_created_at");
    }
}
