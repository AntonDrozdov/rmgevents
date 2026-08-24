using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCorebackendSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "corebackend");

            migrationBuilder.CreateTable(
                name: "images",
                schema: "corebackend",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Data = table.Column<byte[]>(type: "bytea", nullable: false),
                    AltText = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_images", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "logins",
                schema: "corebackend",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    username = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    password_hash = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_logins", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "permissions",
                schema: "corebackend",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_permissions", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "events",
                schema: "corebackend",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    logo_image_id = table.Column<Guid>(type: "uuid", nullable: true),
                    owner_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    is_archived = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_events", x => x.id);
                    table.ForeignKey(
                        name: "FK_events_images_logo_image_id",
                        column: x => x.logo_image_id,
                        principalSchema: "corebackend",
                        principalTable: "images",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "groups",
                schema: "corebackend",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    parent_group_id = table.Column<Guid>(type: "uuid", nullable: true),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    quota = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_groups", x => x.id);
                    table.ForeignKey(
                        name: "FK_groups_events_event_id",
                        column: x => x.event_id,
                        principalSchema: "corebackend",
                        principalTable: "events",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_groups_groups_parent_group_id",
                        column: x => x.parent_group_id,
                        principalSchema: "corebackend",
                        principalTable: "groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "roles",
                schema: "corebackend",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_roles", x => x.id);
                    table.ForeignKey(
                        name: "FK_roles_events_event_id",
                        column: x => x.event_id,
                        principalSchema: "corebackend",
                        principalTable: "events",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "role_permissions",
                schema: "corebackend",
                columns: table => new
                {
                    role_id = table.Column<Guid>(type: "uuid", nullable: false),
                    permission_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_role_permissions", x => new { x.role_id, x.permission_id });
                    table.ForeignKey(
                        name: "FK_role_permissions_permissions_permission_id",
                        column: x => x.permission_id,
                        principalSchema: "corebackend",
                        principalTable: "permissions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_role_permissions_roles_role_id",
                        column: x => x.role_id,
                        principalSchema: "corebackend",
                        principalTable: "roles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "users",
                schema: "corebackend",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    login_id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    role_id = table.Column<Guid>(type: "uuid", nullable: false),
                    group_id = table.Column<Guid>(type: "uuid", nullable: false),
                    display_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    meta = table.Column<string>(type: "jsonb", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_users", x => x.id);
                    table.ForeignKey(
                        name: "FK_users_events_event_id",
                        column: x => x.event_id,
                        principalSchema: "corebackend",
                        principalTable: "events",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_users_groups_group_id",
                        column: x => x.group_id,
                        principalSchema: "corebackend",
                        principalTable: "groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_users_logins_login_id",
                        column: x => x.login_id,
                        principalSchema: "corebackend",
                        principalTable: "logins",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_users_roles_role_id",
                        column: x => x.role_id,
                        principalSchema: "corebackend",
                        principalTable: "roles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "guests",
                schema: "corebackend",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    group_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    email = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    phone = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "pending"),
                    meta = table.Column<string>(type: "jsonb", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    approved_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_guests", x => x.id);
                    table.ForeignKey(
                        name: "FK_guests_events_event_id",
                        column: x => x.event_id,
                        principalSchema: "corebackend",
                        principalTable: "events",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_guests_groups_group_id",
                        column: x => x.group_id,
                        principalSchema: "corebackend",
                        principalTable: "groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_guests_users_created_by_user_id",
                        column: x => x.created_by_user_id,
                        principalSchema: "corebackend",
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_events_logo_image_id",
                schema: "corebackend",
                table: "events",
                column: "logo_image_id");

            migrationBuilder.CreateIndex(
                name: "IX_events_owner_id",
                schema: "corebackend",
                table: "events",
                column: "owner_id");

            migrationBuilder.CreateIndex(
                name: "IX_groups_event_id_name",
                schema: "corebackend",
                table: "groups",
                columns: new[] { "event_id", "name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_groups_parent_group_id",
                schema: "corebackend",
                table: "groups",
                column: "parent_group_id");

            migrationBuilder.CreateIndex(
                name: "IX_guests_created_by_user_id",
                schema: "corebackend",
                table: "guests",
                column: "created_by_user_id");

            migrationBuilder.CreateIndex(
                name: "IX_guests_event_id",
                schema: "corebackend",
                table: "guests",
                column: "event_id");

            migrationBuilder.CreateIndex(
                name: "IX_guests_group_id",
                schema: "corebackend",
                table: "guests",
                column: "group_id");

            migrationBuilder.CreateIndex(
                name: "IX_logins_username",
                schema: "corebackend",
                table: "logins",
                column: "username",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_permissions_code",
                schema: "corebackend",
                table: "permissions",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_role_permissions_permission_id",
                schema: "corebackend",
                table: "role_permissions",
                column: "permission_id");

            migrationBuilder.CreateIndex(
                name: "IX_roles_event_id_name",
                schema: "corebackend",
                table: "roles",
                columns: new[] { "event_id", "name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_users_event_id",
                schema: "corebackend",
                table: "users",
                column: "event_id");

            migrationBuilder.CreateIndex(
                name: "IX_users_group_id",
                schema: "corebackend",
                table: "users",
                column: "group_id");

            migrationBuilder.CreateIndex(
                name: "IX_users_login_id_event_id",
                schema: "corebackend",
                table: "users",
                columns: new[] { "login_id", "event_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_users_role_id",
                schema: "corebackend",
                table: "users",
                column: "role_id");

            var createdAt = new DateTimeOffset(2026, 8, 24, 0, 0, 0, TimeSpan.Zero);
            var adminEventId = new Guid("22222222-2222-2222-2222-222222222222");
            var adminGroupId = new Guid("33333333-3333-3333-3333-333333333333");
            var administratorRoleId = new Guid("44444444-4444-4444-4444-444444444444");
            var adminUserId = new Guid("55555555-5555-5555-5555-555555555555");
            var adminLoginId = adminUserId;
            var createEventPermissionId = new Guid("aaaaaaaa-0000-0000-0000-000000000001");
            var createGuestPermissionId = new Guid("aaaaaaaa-0000-0000-0000-000000000002");
            var createGroupPermissionId = new Guid("aaaaaaaa-0000-0000-0000-000000000003");
            var approveGuestPermissionId = new Guid("aaaaaaaa-0000-0000-0000-000000000004");
            var createUserPermissionId = new Guid("aaaaaaaa-0000-0000-0000-000000000005");

            migrationBuilder.InsertData(
                schema: "corebackend",
                table: "logins",
                columns: new[] { "id", "username", "password_hash", "created_at" },
                values: new object[,]
                {
                    { adminLoginId, "admin", "jGl25bVBBBW96Qi9Te4V37Fnqchz/Eu4qB9vKrRIqRg=", createdAt }
                });

            migrationBuilder.InsertData(
                schema: "corebackend",
                table: "permissions",
                columns: new[] { "id", "code", "description", "created_at" },
                values: new object[,]
                {
                    { createEventPermissionId, "create_event", "Create events", createdAt },
                    { createGuestPermissionId, "create_guest", "Create guests", createdAt },
                    { createGroupPermissionId, "create_group", "Create groups", createdAt },
                    { approveGuestPermissionId, "approve_guest", "Approve or reject guests", createdAt },
                    { createUserPermissionId, "create_user", "Create event users", createdAt }
                });

            migrationBuilder.InsertData(
                schema: "corebackend",
                table: "events",
                columns: new[] { "id", "name", "description", "logo_image_id", "owner_id", "created_at", "is_archived" },
                values: new object[,]
                {
                    { adminEventId, "Initial administration event", "Bootstrap event for the administrator account.", null, adminUserId, createdAt, false }
                });

            migrationBuilder.InsertData(
                schema: "corebackend",
                table: "groups",
                columns: new[] { "id", "event_id", "parent_group_id", "name", "quota", "created_at" },
                values: new object[,]
                {
                    { adminGroupId, adminEventId, null, "Root", 1000, createdAt }
                });

            migrationBuilder.InsertData(
                schema: "corebackend",
                table: "roles",
                columns: new[] { "id", "event_id", "name", "created_at" },
                values: new object[,]
                {
                    { administratorRoleId, adminEventId, "administrator", createdAt }
                });

            migrationBuilder.InsertData(
                schema: "corebackend",
                table: "role_permissions",
                columns: new[] { "role_id", "permission_id" },
                values: new object[,]
                {
                    { administratorRoleId, createEventPermissionId },
                    { administratorRoleId, createGuestPermissionId },
                    { administratorRoleId, createGroupPermissionId },
                    { administratorRoleId, approveGuestPermissionId },
                    { administratorRoleId, createUserPermissionId }
                });

            migrationBuilder.InsertData(
                schema: "corebackend",
                table: "users",
                columns: new[] { "id", "login_id", "event_id", "role_id", "group_id", "display_name", "meta", "created_at" },
                values: new object[,]
                {
                    { adminUserId, adminLoginId, adminEventId, administratorRoleId, adminGroupId, "Administrator", null, createdAt }
                });

            migrationBuilder.AddForeignKey(
                name: "FK_events_users_owner_id",
                schema: "corebackend",
                table: "events",
                column: "owner_id",
                principalSchema: "corebackend",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_events_images_logo_image_id",
                schema: "corebackend",
                table: "events");

            migrationBuilder.DropForeignKey(
                name: "FK_events_users_owner_id",
                schema: "corebackend",
                table: "events");

            migrationBuilder.DropTable(
                name: "guests",
                schema: "corebackend");

            migrationBuilder.DropTable(
                name: "role_permissions",
                schema: "corebackend");

            migrationBuilder.DropTable(
                name: "permissions",
                schema: "corebackend");

            migrationBuilder.DropTable(
                name: "images",
                schema: "corebackend");

            migrationBuilder.DropTable(
                name: "users",
                schema: "corebackend");

            migrationBuilder.DropTable(
                name: "groups",
                schema: "corebackend");

            migrationBuilder.DropTable(
                name: "logins",
                schema: "corebackend");

            migrationBuilder.DropTable(
                name: "roles",
                schema: "corebackend");

            migrationBuilder.DropTable(
                name: "events",
                schema: "corebackend");
        }
    }
}
