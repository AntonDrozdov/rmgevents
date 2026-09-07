using Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260907120000_AddSearchIndexes")]
    public partial class AddSearchIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                CREATE EXTENSION IF NOT EXISTS pg_trgm;

                CREATE INDEX IF NOT EXISTS "IX_guests_event_id_created_at"
                    ON corebackend.guests (event_id, created_at);
                CREATE INDEX IF NOT EXISTS "IX_guests_event_id_status_created_at"
                    ON corebackend.guests (event_id, status, created_at);

                CREATE INDEX IF NOT EXISTS "IX_users_event_id_created_at"
                    ON corebackend.users (event_id, created_at);

                CREATE INDEX IF NOT EXISTS "IX_guests_name_trgm"
                    ON corebackend.guests USING gin (name gin_trgm_ops);
                CREATE INDEX IF NOT EXISTS "IX_guests_email_trgm"
                    ON corebackend.guests USING gin (email gin_trgm_ops)
                    WHERE email IS NOT NULL;
                CREATE INDEX IF NOT EXISTS "IX_guests_phone_trgm"
                    ON corebackend.guests USING gin (phone gin_trgm_ops)
                    WHERE phone IS NOT NULL;
                CREATE INDEX IF NOT EXISTS "IX_guests_phone_digits_trgm"
                    ON corebackend.guests USING gin ((regexp_replace(phone, '[^0-9]', '', 'g')) gin_trgm_ops)
                    WHERE phone IS NOT NULL;

                CREATE INDEX IF NOT EXISTS "IX_users_surname_trgm"
                    ON corebackend.users USING gin (surname gin_trgm_ops);
                CREATE INDEX IF NOT EXISTS "IX_users_name_trgm"
                    ON corebackend.users USING gin (name gin_trgm_ops);
                CREATE INDEX IF NOT EXISTS "IX_users_email_trgm"
                    ON corebackend.users USING gin (email gin_trgm_ops)
                    WHERE email IS NOT NULL;

                CREATE INDEX IF NOT EXISTS "IX_logins_login_trgm"
                    ON corebackend.logins USING gin (login gin_trgm_ops);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DROP INDEX IF EXISTS corebackend."IX_logins_login_trgm";

                DROP INDEX IF EXISTS corebackend."IX_users_email_trgm";
                DROP INDEX IF EXISTS corebackend."IX_users_name_trgm";
                DROP INDEX IF EXISTS corebackend."IX_users_surname_trgm";
                DROP INDEX IF EXISTS corebackend."IX_users_event_id_created_at";

                DROP INDEX IF EXISTS corebackend."IX_guests_phone_digits_trgm";
                DROP INDEX IF EXISTS corebackend."IX_guests_phone_trgm";
                DROP INDEX IF EXISTS corebackend."IX_guests_email_trgm";
                DROP INDEX IF EXISTS corebackend."IX_guests_name_trgm";
                DROP INDEX IF EXISTS corebackend."IX_guests_event_id_status_created_at";
                DROP INDEX IF EXISTS corebackend."IX_guests_event_id_created_at";
                """);
        }
    }
}
