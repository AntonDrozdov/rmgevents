using System;
using System.IO;
using System.Reflection;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SeedFrontendImages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "images",
                columns: new[] { "Id", "FileName", "ContentType", "Data", "AltText" },
                values: new object[,]
                {
                    {
                        new Guid("7c86f95f-5e1a-49fb-8b2b-1cc31743ffb3"),
                        "1mwworks-collection.jpg",
                        "image/jpeg",
                        LoadEmbeddedImage("1mwworks-collection.jpg"),
                        "Коллекция MWWorks: костровая чаша, мангал, садовая мебель и качели"
                    },
                    {
                        new Guid("2f477a7e-d8b1-4f8b-a2c1-c5e0f5d7aece"),
                        "2individual-approach.jpg",
                        "image/jpeg",
                        LoadEmbeddedImage("2individual-approach.jpg"),
                        "Специалист обсуждает с заказчиком материалы и проект садовой мебели"
                    },
                    {
                        new Guid("4ef8b4d4-7ab9-4e5f-8f0d-1a8b9f87439f"),
                        "3quality-control.jpg",
                        "image/jpeg",
                        LoadEmbeddedImage("3quality-control.jpg"),
                        "Специалист проверяет качество металлического каркаса и деревянных деталей кресла"
                    },
                    {
                        new Guid("30f9d4da-2d71-4e2c-b69b-44ebb5650d72"),
                        "4product-design.jpg",
                        "image/jpeg",
                        LoadEmbeddedImage("4product-design.jpg"),
                        "Промышленный дизайнер создаёт проект мебели в студии"
                    },
                    {
                        new Guid("11807b3c-41bb-41d1-9df3-a3ed29f1c7d0"),
                        "5professional-equipment.jpg",
                        "image/jpeg",
                        LoadEmbeddedImage("5professional-equipment.jpg"),
                        "Оператор работает на современном станке для лазерной резки металла"
                    }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "images",
                keyColumn: "Id",
                keyValue: new Guid("7c86f95f-5e1a-49fb-8b2b-1cc31743ffb3"));

            migrationBuilder.DeleteData(
                table: "images",
                keyColumn: "Id",
                keyValue: new Guid("2f477a7e-d8b1-4f8b-a2c1-c5e0f5d7aece"));

            migrationBuilder.DeleteData(
                table: "images",
                keyColumn: "Id",
                keyValue: new Guid("4ef8b4d4-7ab9-4e5f-8f0d-1a8b9f87439f"));

            migrationBuilder.DeleteData(
                table: "images",
                keyColumn: "Id",
                keyValue: new Guid("30f9d4da-2d71-4e2c-b69b-44ebb5650d72"));

            migrationBuilder.DeleteData(
                table: "images",
                keyColumn: "Id",
                keyValue: new Guid("11807b3c-41bb-41d1-9df3-a3ed29f1c7d0"));
        }

        private static byte[] LoadEmbeddedImage(string fileName)
        {
            var assembly = typeof(SeedFrontendImages).Assembly;
            var resourceName = $"Infrastructure.SeedImages.{fileName}";

            using var stream = assembly.GetManifestResourceStream(resourceName)
                ?? throw new InvalidOperationException($"Embedded resource '{resourceName}' not found.");

            using var memoryStream = new MemoryStream();
            stream.CopyTo(memoryStream);
            return memoryStream.ToArray();
        }
    }
}
