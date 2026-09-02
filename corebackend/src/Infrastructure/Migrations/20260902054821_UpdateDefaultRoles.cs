using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UpdateDefaultRoles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                INSERT INTO corebackend.role_permissions (role_id, permission_id)
                SELECT role.id, permission.id
                FROM corebackend.roles AS role
                CROSS JOIN corebackend.permissions AS permission
                WHERE role.name = 'Manager'
                  AND permission.code = 'approve_guest'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM corebackend.role_permissions AS existing
                      WHERE existing.role_id = role.id
                        AND existing.permission_id = permission.id
                  );

                DELETE FROM corebackend.role_permissions
                WHERE role_id IN (
                    SELECT id FROM corebackend.roles WHERE name = 'Approver'
                );

                UPDATE corebackend.roles
                SET name = 'Creator'
                WHERE name = 'Approver';

                INSERT INTO corebackend.role_permissions (role_id, permission_id)
                SELECT role.id, permission.id
                FROM corebackend.roles AS role
                CROSS JOIN corebackend.permissions AS permission
                WHERE role.name = 'Creator'
                  AND permission.code = 'create_guest'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM corebackend.role_permissions AS existing
                      WHERE existing.role_id = role.id
                        AND existing.permission_id = permission.id
                  );
                """);

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DELETE FROM corebackend.role_permissions
                WHERE role_id IN (
                    SELECT id FROM corebackend.roles WHERE name = 'Manager'
                )
                AND permission_id = (
                    SELECT id FROM corebackend.permissions WHERE code = 'approve_guest'
                );

                DELETE FROM corebackend.role_permissions
                WHERE role_id IN (
                    SELECT id FROM corebackend.roles WHERE name = 'Creator'
                );

                UPDATE corebackend.roles
                SET name = 'Approver'
                WHERE name = 'Creator';

                INSERT INTO corebackend.role_permissions (role_id, permission_id)
                SELECT role.id, permission.id
                FROM corebackend.roles AS role
                CROSS JOIN corebackend.permissions AS permission
                WHERE role.name = 'Approver'
                  AND permission.code = 'approve_guest'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM corebackend.role_permissions AS existing
                      WHERE existing.role_id = role.id
                        AND existing.permission_id = permission.id
                  );
                """);

        }
    }
}
