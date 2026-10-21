using Microsoft.EntityFrameworkCore.Migrations;
using System.Text.Json;

#nullable disable

namespace Infrastructure.Migrations
{
    public partial class SeedPredefinedPlacementTemplates : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var createdAt = new DateTimeOffset(2026, 10, 20, 0, 0, 0, TimeSpan.Zero);
            var templates = new[]
            {
                BuildTemplate(100, Build100),
                BuildTemplate(500, Build500),
                BuildTemplate(1000, Build1000)
            };

            migrationBuilder.InsertData(
                schema: "corebackend",
                table: "placement_templates",
                columns: new[] { "Id", "Name", "Structure", "CreatedAt" },
                values: new object[,]
                {
                    { -100L, "01 · 100 мест — презентация", templates[0], createdAt },
                    { -500L, "02 · 500 мест — деловой форум", templates[1], createdAt },
                    { -1000L, "03 · 1000 мест — конференц-зал", templates[2], createdAt }
                });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                schema: "corebackend",
                table: "placement_templates",
                keyColumn: "Id",
                keyValues: new object[] { -100L, -500L, -1000L });
        }

        private static string BuildTemplate(int capacity, Action<TemplateBuilder> configure)
        {
            var builder = new TemplateBuilder();
            configure(builder);
            var actualCapacity = builder.Items.Sum(item => item.Quota ?? 0);
            if (actualCapacity != capacity)
                throw new InvalidOperationException($"Template for {capacity} seats contains {actualCapacity} seats.");
            return JsonSerializer.Serialize(builder.Items);
        }

        private static void Build100(TemplateBuilder template)
        {
            var rows = template.Container("Зрительный сектор", 3850, 3450, 760, 400);
            template.Rows(rows, "Ряд", 3, 20, 3890, 3570, 76);

            var tables = template.Container("Зона переговоров", 4780, 3450, 900, 690);
            template.Tables(tables, "Стол", 5, 8, 4820, 3570, 3, 280, 320);
        }

        private static void Build500(TemplateBuilder template)
        {
            var parterre = template.Container("Основной партер", 3350, 2700, 1120, 900);
            template.Rows(parterre, "Ряд партера", 8, 30, 3390, 2820, 76);

            var balcony = template.Container("Балкон", 4700, 2850, 800, 720);
            template.Rows(balcony, "Ряд балкона", 6, 20, 4740, 2970, 76);

            var leftTables = template.Container("Левая клубная зона", 3200, 3800, 1150, 850);
            template.Tables(leftTables, "Левый стол", 7, 10, 3240, 3920, 4, 280, 330);
            var rightTables = template.Container("Правая клубная зона", 4550, 3800, 1150, 850);
            template.Tables(rightTables, "Правый стол", 7, 10, 4590, 3920, 4, 280, 330);
        }

        private static void Build1000(TemplateBuilder template)
        {
            var center = template.Container("Центральный сектор", 3500, 2300, 1450, 1120);
            template.Rows(center, "Центральный ряд", 12, 40, 3540, 2420, 76);

            var left = template.Container("Левый сектор", 2350, 2750, 950, 650);
            template.Rows(left, "Левый ряд", 6, 25, 2390, 2870, 76);
            var right = template.Container("Правый сектор", 5150, 2750, 950, 650);
            template.Rows(right, "Правый ряд", 6, 25, 5190, 2870, 76);

            var tables = template.Container("Экспертная зона со столами", 3050, 3650, 2450, 1550);
            template.Tables(tables, "Экспертный стол", 22, 10, 3090, 3770, 6, 390, 340);
        }

        private sealed class TemplateBuilder
        {
            private long nextId = 1;
            public List<TemplatePlacement> Items { get; } = [];

            public long Container(string name, int x, int y, int width, int height)
            {
                var id = nextId++;
                Items.Add(new(id, null, null, name, null, 0, [], true, x, y, width, height, null, false));
                return id;
            }

            public void Rows(long parentId, string prefix, int count, int seats, int x, int y, int gap)
            {
                for (var index = 0; index < count; index++)
                    Items.Add(new(nextId++, parentId, null, $"{prefix} {index + 1}", seats, 0, [], false, x, y + index * gap, null, null, null, true));
            }

            public void Tables(long parentId, string prefix, int count, int seats, int x, int y, int columns, int xGap, int yGap)
            {
                for (var index = 0; index < count; index++)
                    Items.Add(new(nextId++, parentId, null, $"{prefix} {index + 1}", seats, 0, [], false, x + index % columns * xGap, y + index / columns * yGap, null, null, null, false));
            }

        }

        private sealed record TemplatePlacement(
            long Id,
            long? ParentId,
            long? GroupId,
            string Name,
            int? Quota,
            int GuestCount,
            List<int> OccupiedSeatNumbers,
            bool DisplayChildrenAsRows,
            int? CanvasX,
            int? CanvasY,
            int? CanvasWidth,
            int? CanvasHeight,
            Guid? RowBatchId,
            bool IsRow);
    }
}
