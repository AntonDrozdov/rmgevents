using Application.Entities;
using Application.Repositories;
using Application.Services;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using System.IO.Compression;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using AppGroup = Application.Entities.Group;

namespace Infrastructure.Services;

public sealed partial class OrganizationStructureService(
    ApplicationDbContext db,
    IGroupRepository groupRepository,
    IPermissionService permissionService,
    IEventStateGuard eventStateGuard,
    IEventLogService eventLogService,
    IMemoryCache cache) : IOrganizationStructureService
{
    private const int RootQuota = 10000;
    private const int MaximumFileSize = 10 * 1024 * 1024;
    private static readonly TimeSpan TreeCacheTtl = TimeSpan.FromHours(1);
    private static readonly XNamespace SpreadsheetNamespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

    public async Task<OrganizationImportResult> ImportRmgStructureAsync(
        long eventId,
        long loginId,
        string fileName,
        Stream file,
        CancellationToken cancellationToken = default)
    {
        if (!await permissionService.HasPermissionAsync(loginId, eventId, "create_event"))
            throw new UnauthorizedAccessException("No permission to import organization structure");

        if (!Path.GetExtension(fileName).Equals(".xlsx", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Можно загрузить только XLSX-файл.");

        await using var memory = new MemoryStream();
        await file.CopyToAsync(memory, cancellationToken);
        if (memory.Length == 0)
            throw new InvalidOperationException("Файл пуст.");
        if (memory.Length > MaximumFileSize)
            throw new InvalidOperationException("Размер файла не должен превышать 10 МБ.");

        memory.Position = 0;
        var rows = ReadRows(memory);
        if (rows.Count == 0)
            throw new InvalidOperationException("В файле нет строк для импорта.");

        ValidateHeader(rows[0]);
        var dataRows = rows
            .Skip(1)
            .Where(row => !string.IsNullOrWhiteSpace(row.ParentName)
                          || !string.IsNullOrWhiteSpace(row.DepartmentName)
                          || !string.IsNullOrWhiteSpace(row.EmployeeFullName)
                          || !string.IsNullOrWhiteSpace(row.Position))
            .Select(row => row with
            {
                ParentName = NormalizeText(row.ParentName),
                DepartmentName = NormalizeText(row.DepartmentName),
                EmployeeFullName = NormalizeText(row.EmployeeFullName),
                Position = NormalizeText(row.Position)
            })
            .ToList();

        if (dataRows.Count == 0)
            throw new InvalidOperationException("В файле нет данных для импорта.");

        var warnings = new List<string>();
        foreach (var row in dataRows)
        {
            if (string.IsNullOrWhiteSpace(row.DepartmentName))
                throw new InvalidOperationException($"В строке {row.RowNumber} не указано подразделение.");
            if (string.IsNullOrWhiteSpace(row.EmployeeFullName))
                throw new InvalidOperationException($"В строке {row.RowNumber} не указан сотрудник.");
            if (string.IsNullOrWhiteSpace(row.Position))
                throw new InvalidOperationException($"В строке {row.RowNumber} не указана должность.");
        }

        var rowsByDepartmentName = dataRows
            .GroupBy(row => NormalizeKey(row.DepartmentName))
            .ToDictionary(group => group.Key, group =>
            {
                var parentNames = group.Select(row => NormalizeKey(row.ParentName)).Distinct().ToList();
                if (parentNames.Count > 1)
                {
                    warnings.Add(
                        $"Подразделение «{group.First().DepartmentName}» встречается под разными родителями; для родительских ссылок используется первое вхождение.");
                }

                return group.First();
            });

        var parentNames = dataRows
            .Where(row => !string.IsNullOrWhiteSpace(row.ParentName))
            .Select(row => NormalizeKey(row.ParentName))
            .Distinct()
            .ToList();
        var generatedParentKeys = parentNames
            .Where(parentName => !rowsByDepartmentName.ContainsKey(parentName))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var key in generatedParentKeys)
        {
            var sourceName = dataRows.First(row => NormalizeKey(row.ParentName) == key).ParentName;
            warnings.Add($"Создан виртуальный родитель «{sourceName}», потому что он указан в колонке «Вышестоящее подразделение», но отсутствует как подразделение.");
        }

        var nodesByPath = new Dictionary<string, ImportDepartmentNode>(StringComparer.OrdinalIgnoreCase);
        var nodesByNameForGeneratedParents = new Dictionary<string, ImportDepartmentNode>(StringComparer.OrdinalIgnoreCase);

        ImportDepartmentNode EnsureDepartment(string departmentName, string? sourceParentName, int? sourceRowNumber, HashSet<string>? stack = null)
        {
            var normalizedName = NormalizeKey(departmentName);
            stack ??= new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (!stack.Add(normalizedName))
            {
                warnings.Add($"Обнаружена циклическая ссылка для подразделения «{departmentName}». Узел импортирован на верхний уровень.");
                sourceParentName = null;
            }

            ImportDepartmentNode? parent = null;
            if (!string.IsNullOrWhiteSpace(sourceParentName))
            {
                var parentKey = NormalizeKey(sourceParentName);
                if (rowsByDepartmentName.TryGetValue(parentKey, out var parentRow))
                {
                    parent = EnsureDepartment(parentRow.DepartmentName, parentRow.ParentName, parentRow.RowNumber, stack);
                }
                else
                {
                    if (!nodesByNameForGeneratedParents.TryGetValue(parentKey, out parent))
                    {
                        parent = new ImportDepartmentNode(
                            sourceParentName!,
                            NormalizeKey(sourceParentName),
                            null,
                            null,
                            true);
                        nodesByNameForGeneratedParents[parentKey] = parent;
                        nodesByPath[parent.Path] = parent;
                    }
                }
            }

            stack.Remove(normalizedName);

            var path = $"{parent?.Path ?? "root"}/{normalizedName}";
            if (nodesByPath.TryGetValue(path, out var existing))
                return existing;

            var node = new ImportDepartmentNode(
                departmentName,
                normalizedName,
                sourceParentName,
                sourceRowNumber,
                false)
            {
                Parent = parent
            };
            parent?.Children.Add(node);
            nodesByPath[path] = node;
            return node;
        }

        foreach (var row in dataRows)
        {
            var department = EnsureDepartment(row.DepartmentName, row.ParentName, row.RowNumber);
            var (surname, name, additionalName) = SplitFullName(row.EmployeeFullName);
            department.Employees.Add(new ImportEmployeeNode(
                row.EmployeeFullName,
                surname,
                name,
                additionalName,
                row.Position,
                row.RowNumber));
        }

        var rootNodes = nodesByPath.Values
            .Where(node => node.Parent == null)
            .OrderBy(node => node.Name)
            .ToList();
        var now = DateTimeOffset.UtcNow;

        var executionStrategy = db.Database.CreateExecutionStrategy();
        OrganizationImportResult result = null!;
        await executionStrategy.ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            // DELETE honors ON DELETE SET NULL for users linked to old employees.
            // TRUNCATE CASCADE would also truncate users and their related events.
            await db.OrganizationEmployees.ExecuteDeleteAsync(cancellationToken);
            await db.OrganizationDepartments
                .Where(department => department.ParentId != null)
                .ExecuteUpdateAsync(setters => setters.SetProperty(department => department.ParentId, (long?)null), cancellationToken);
            await db.OrganizationDepartments.ExecuteDeleteAsync(cancellationToken);

            foreach (var node in rootNodes)
                AddDepartment(node, null, now);

            await db.SaveChangesAsync(cancellationToken);

            result = new OrganizationImportResult(
                nodesByPath.Count,
                dataRows.Count,
                nodesByPath.Values.Count(node => node.IsGeneratedFromParentName),
                dataRows.Count,
                warnings);

            await eventLogService.AddAsync(
                eventId,
                loginId,
                "original_structure_imported",
                "OrganizationStructure",
                null,
                "Загружена оригинальная структура",
                $"Файл: {Path.GetFileName(fileName)}. Отделов: {result.DepartmentsCreated}, сотрудников: {result.EmployeesCreated}");

            await transaction.CommitAsync(cancellationToken);
        });

        cache.Remove(BuildTreeCacheKey(eventId));

        return result;
    }

    public async Task<OrganizationStructureTree> GetTreeAsync(
        long eventId,
        long loginId,
        CancellationToken cancellationToken = default)
    {
        var userGroupId = await permissionService.GetUserGroupInEventAsync(loginId, eventId);
        if (!userGroupId.HasValue)
            throw new UnauthorizedAccessException("User is not assigned to this event");

        var cacheKey = BuildTreeCacheKey(eventId);
        if (cache.TryGetValue(cacheKey, out OrganizationStructureTree? cachedTree) && cachedTree != null)
            return cachedTree;

        var departments = await db.OrganizationDepartments
            .AsNoTracking()
            .OrderBy(department => department.Name)
            .ToListAsync(cancellationToken);
        var employees = await db.OrganizationEmployees
            .AsNoTracking()
            .OrderBy(employee => employee.FullName)
            .ToListAsync(cancellationToken);

        var employeesByDepartmentId = employees
            .GroupBy(employee => employee.DepartmentId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .Select(employee => new OrganizationEmployeeTreeItem(
                        employee.Id,
                        employee.DepartmentId,
                        employee.FullName,
                        employee.Surname,
                        employee.Name,
                        employee.AdditionalName,
                        employee.Position,
                        employee.SourceRowNumber))
                    .ToList());
        var childrenByParentId = departments
            .Where(department => department.ParentId.HasValue)
            .GroupBy(department => department.ParentId!.Value)
            .ToDictionary(group => group.Key, group => group.OrderBy(item => item.Name).ToList());

        OrganizationDepartmentTreeItem MapDepartment(OrganizationDepartment department) =>
            new(
                department.Id,
                department.ParentId,
                department.Name,
                department.IsGeneratedFromParentName,
                employeesByDepartmentId.GetValueOrDefault(department.Id) ?? [],
                (childrenByParentId.GetValueOrDefault(department.Id) ?? [])
                    .Select(MapDepartment)
                    .ToList());

        var tree = new OrganizationStructureTree(
            departments
                .Where(department => department.ParentId == null)
                .OrderBy(department => department.Name)
                .Select(MapDepartment)
                .ToList(),
            departments.Count,
            employees.Count,
            departments
                .Select(department => (DateTimeOffset?)department.CreatedAt)
                .Concat(employees.Select(employee => (DateTimeOffset?)employee.CreatedAt))
                .Max());

        cache.Set(cacheKey, tree, TreeCacheTtl);
        return tree;
    }

    public async Task<ApplyOriginalStructureResult> ApplyOriginalStructureAsync(
        long eventId,
        long loginId,
        CancellationToken cancellationToken = default)
    {
        await eventStateGuard.EnsureActiveAsync(eventId);

        if (!await permissionService.HasPermissionAsync(loginId, eventId, "create_event"))
            throw new UnauthorizedAccessException("No permission to apply organization structure");

        var departments = await db.OrganizationDepartments
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        if (departments.Count == 0)
            throw new InvalidOperationException("Оригинальная структура ещё не загружена.");

        var rootDepartments = departments
            .Where(department => department.ParentId == null)
            .OrderBy(department => department.Name)
            .ToList();
        var departmentChildren = departments
            .Where(department => department.ParentId.HasValue)
            .GroupBy(department => department.ParentId!.Value)
            .ToDictionary(group => group.Key, group => group.OrderBy(item => item.Name).ToList());

        var groups = await groupRepository.GetByEventIdAsync(eventId);
        var rootGroups = groups.Where(group => group.ParentGroupId == null).ToList();
        if (rootGroups.Count != 1)
            throw new InvalidOperationException("У мероприятия должна быть одна корневая группа.");

        var rootGroup = rootGroups[0];
        var usedNames = groups
            .Select(group => group.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var warnings = new List<string>();
        var groupsCreated = 0;
        var groupsReused = 0;
        var groupsRenamed = 0;
        var groupsQuotaUpdated = 0;
        var createdOrTouchedGroups = new List<AppGroup>();

        var executionStrategy = db.Database.CreateExecutionStrategy();
        await executionStrategy.ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

            if (rootGroup.Quota < RootQuota)
            {
                rootGroup.Quota = RootQuota;
                await groupRepository.UpdateAsync(rootGroup);
                groupsQuotaUpdated++;
            }

            async Task ApplyChildrenAsync(AppGroup parentGroup, List<OrganizationDepartment> childDepartments, int parentQuota)
            {
                if (childDepartments.Count == 0)
                    return;

                var childQuota = parentQuota / childDepartments.Count;
                foreach (var department in childDepartments)
                {
                    var existingGroup = groups.FirstOrDefault(group =>
                        group.ParentGroupId == parentGroup.Id &&
                        IsOriginalStructureGroupMatch(group.Name, department.Name, parentGroup.Name));

                    AppGroup targetGroup;
                    if (existingGroup != null)
                    {
                        targetGroup = existingGroup;
                        groupsReused++;
                    }
                    else
                    {
                        var groupName = department.Name;
                        if (usedNames.Contains(groupName))
                        {
                            groupName = BuildUniqueGroupName(department.Name, parentGroup.Name, usedNames);
                            groupsRenamed++;
                            warnings.Add($"Группа «{department.Name}» создана как «{groupName}», потому что имя уже занято в мероприятии.");
                        }

                        targetGroup = new AppGroup
                        {
                            EventId = eventId,
                            ParentGroupId = parentGroup.Id,
                            Name = groupName,
                            Quota = childQuota,
                            CreatedAt = DateTimeOffset.UtcNow
                        };

                        await groupRepository.AddAsync(targetGroup);
                        await groupRepository.SaveChangesAsync();
                        groups.Add(targetGroup);
                        usedNames.Add(targetGroup.Name);
                        groupsCreated++;
                    }

                    if (targetGroup.Quota < childQuota)
                    {
                        targetGroup.Quota = childQuota;
                        await groupRepository.UpdateAsync(targetGroup);
                        groupsQuotaUpdated++;
                    }

                    createdOrTouchedGroups.Add(targetGroup);
                    var children = departmentChildren.GetValueOrDefault(department.Id) ?? [];
                    await ApplyChildrenAsync(targetGroup, children, childQuota);
                }
            }

            await ApplyChildrenAsync(rootGroup, rootDepartments, RootQuota);
            groupsQuotaUpdated += await EnsureParentQuotasAsync(groups, cancellationToken);
            await groupRepository.SaveChangesAsync();

            var rootChildrenQuota = groups
                .Where(group => group.ParentGroupId == rootGroup.Id)
                .Sum(group => group.Quota);
            if (rootGroup.Quota < rootChildrenQuota)
            {
                rootGroup.Quota = rootChildrenQuota;
                await groupRepository.UpdateAsync(rootGroup);
                await groupRepository.SaveChangesAsync();
                groupsQuotaUpdated++;
                warnings.Add($"Квота корневой группы увеличена до {rootChildrenQuota}, чтобы сохранить уже существующие группы и применённую структуру.");
            }

            var result = new ApplyOriginalStructureResult(
                groupsCreated,
                groupsReused,
                groupsRenamed,
                groupsQuotaUpdated,
                departments.Count,
                warnings);

            await eventLogService.AddAsync(
                eventId,
                loginId,
                "original_structure_applied",
                "Group",
                rootGroup.Id,
                "Применена оригинальная структура",
                $"Создано групп: {result.GroupsCreated}, переиспользовано: {result.GroupsReused}, отделов обработано: {result.DepartmentsProcessed}");

            await transaction.CommitAsync(cancellationToken);
        });

        return new ApplyOriginalStructureResult(
            groupsCreated,
            groupsReused,
            groupsRenamed,
            groupsQuotaUpdated,
            departments.Count,
            warnings);
    }

    private void AddDepartment(ImportDepartmentNode node, OrganizationDepartment? parent, DateTimeOffset now)
    {
        var entity = new OrganizationDepartment
        {
            Parent = parent,
            Name = node.Name,
            NormalizedName = node.NormalizedName,
            SourceParentName = node.SourceParentName,
            SourceRowNumber = node.SourceRowNumber,
            IsGeneratedFromParentName = node.IsGeneratedFromParentName,
            CreatedAt = now
        };

        node.Entity = entity;
        db.OrganizationDepartments.Add(entity);

        foreach (var child in node.Children.OrderBy(child => child.Name))
            AddDepartment(child, entity, now);

        foreach (var employee in node.Employees)
        {
            db.OrganizationEmployees.Add(new OrganizationEmployee
            {
                Department = entity,
                FullName = employee.FullName,
                Surname = employee.Surname,
                Name = employee.Name,
                AdditionalName = employee.AdditionalName,
                Position = employee.Position,
                SourceRowNumber = employee.SourceRowNumber,
                CreatedAt = now
            });
        }
    }

    private async Task<int> EnsureParentQuotasAsync(List<AppGroup> groups, CancellationToken cancellationToken)
    {
        var updated = 0;
        var childrenByParent = groups
            .Where(group => group.ParentGroupId.HasValue)
            .GroupBy(group => group.ParentGroupId!.Value)
            .ToDictionary(group => group.Key, group => group.ToList());

        foreach (var group in groups.OrderByDescending(group => GetDepth(group, groups)))
        {
            var children = childrenByParent.GetValueOrDefault(group.Id);
            if (children == null || children.Count == 0)
                continue;

            var childrenQuota = children.Sum(child => child.Quota);
            if (group.Quota >= childrenQuota)
                continue;

            group.Quota = childrenQuota;
            await groupRepository.UpdateAsync(group);
            updated++;
        }

        return updated;
    }

    private static string BuildTreeCacheKey(long eventId) => $"organization-structure-tree:{eventId}";

    private static int GetDepth(AppGroup group, List<AppGroup> groups)
    {
        var depth = 0;
        var parentId = group.ParentGroupId;
        while (parentId.HasValue)
        {
            var parent = groups.FirstOrDefault(item => item.Id == parentId.Value);
            if (parent == null)
                break;

            depth++;
            parentId = parent.ParentGroupId;
        }

        return depth;
    }

    private static string BuildUniqueGroupName(string departmentName, string parentName, HashSet<string> usedNames)
    {
        var baseName = $"{departmentName} ({parentName})";
        var candidate = TrimToMaxLength(baseName, 255);
        var counter = 2;
        while (usedNames.Contains(candidate))
        {
            var suffix = $" {counter}";
            candidate = TrimToMaxLength(baseName, 255 - suffix.Length) + suffix;
            counter++;
        }

        return candidate;
    }

    private static bool IsOriginalStructureGroupMatch(string groupName, string departmentName, string parentName)
    {
        if (string.Equals(groupName, departmentName, StringComparison.OrdinalIgnoreCase))
            return true;

        var baseName = TrimToMaxLength($"{departmentName} ({parentName})", 255);
        return string.Equals(groupName, baseName, StringComparison.OrdinalIgnoreCase)
               || groupName.StartsWith($"{baseName} ", StringComparison.OrdinalIgnoreCase);
    }

    private static string TrimToMaxLength(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength].Trim();

    private static List<RawOrganizationRow> ReadRows(Stream file)
    {
        using var archive = new ZipArchive(file, ZipArchiveMode.Read, leaveOpen: true);
        var sharedStrings = ReadSharedStrings(archive);
        var worksheetEntry = archive.GetEntry("xl/worksheets/sheet1.xml")
            ?? throw new InvalidOperationException("В XLSX не найден первый лист.");

        using var worksheetStream = worksheetEntry.Open();
        var document = XDocument.Load(worksheetStream);
        var rows = new List<RawOrganizationRow>();

        foreach (var row in document.Descendants(SpreadsheetNamespace + "row"))
        {
            var rowNumber = int.TryParse(row.Attribute("r")?.Value, out var parsedRowNumber)
                ? parsedRowNumber
                : rows.Count + 1;
            var cells = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            foreach (var cell in row.Elements(SpreadsheetNamespace + "c"))
            {
                var reference = cell.Attribute("r")?.Value ?? string.Empty;
                var column = ColumnNameRegex().Match(reference).Value;
                if (string.IsNullOrWhiteSpace(column))
                    continue;

                cells[column] = ReadCellValue(cell, sharedStrings);
            }

            rows.Add(new RawOrganizationRow(
                rowNumber,
                cells.GetValueOrDefault("A") ?? string.Empty,
                cells.GetValueOrDefault("B") ?? string.Empty,
                cells.GetValueOrDefault("C") ?? string.Empty,
                cells.GetValueOrDefault("D") ?? string.Empty));
        }

        return rows;
    }

    private static List<string> ReadSharedStrings(ZipArchive archive)
    {
        var entry = archive.GetEntry("xl/sharedStrings.xml");
        if (entry == null)
            return [];

        using var stream = entry.Open();
        var document = XDocument.Load(stream);
        return document
            .Descendants(SpreadsheetNamespace + "si")
            .Select(item => string.Concat(item.Descendants(SpreadsheetNamespace + "t").Select(text => text.Value)))
            .ToList();
    }

    private static string ReadCellValue(XElement cell, List<string> sharedStrings)
    {
        var type = cell.Attribute("t")?.Value;
        if (type == "s")
        {
            var rawIndex = cell.Element(SpreadsheetNamespace + "v")?.Value;
            return int.TryParse(rawIndex, out var index) && index >= 0 && index < sharedStrings.Count
                ? sharedStrings[index]
                : string.Empty;
        }

        if (type == "inlineStr")
            return string.Concat(cell.Descendants(SpreadsheetNamespace + "t").Select(text => text.Value));

        return cell.Element(SpreadsheetNamespace + "v")?.Value ?? string.Empty;
    }

    private static void ValidateHeader(RawOrganizationRow header)
    {
        if (!string.Equals(NormalizeText(header.ParentName), "Вышестоящее подразделение", StringComparison.OrdinalIgnoreCase)
            || !string.Equals(NormalizeText(header.DepartmentName), "Подразделение", StringComparison.OrdinalIgnoreCase)
            || !string.Equals(NormalizeText(header.EmployeeFullName), "Сотрудник", StringComparison.OrdinalIgnoreCase)
            || !string.Equals(NormalizeText(header.Position), "Должность", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Файл должен содержать колонки: Вышестоящее подразделение, Подразделение, Сотрудник, Должность.");
        }
    }

    private static string NormalizeText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        return WhitespaceRegex().Replace(value.Trim(), " ");
    }

    private static string NormalizeKey(string? value) => NormalizeText(value).ToUpperInvariant();

    private static (string? Surname, string? Name, string? AdditionalName) SplitFullName(string fullName)
    {
        var parts = NormalizeText(fullName)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        return (
            parts.ElementAtOrDefault(0),
            parts.ElementAtOrDefault(1),
            parts.Length > 2 ? string.Join(" ", parts.Skip(2)) : null);
    }

    [GeneratedRegex("^[A-Z]+")]
    private static partial Regex ColumnNameRegex();

    [GeneratedRegex("\\s+")]
    private static partial Regex WhitespaceRegex();

    private sealed record RawOrganizationRow(
        int RowNumber,
        string ParentName,
        string DepartmentName,
        string EmployeeFullName,
        string Position);

    private sealed record ImportEmployeeNode(
        string FullName,
        string? Surname,
        string? Name,
        string? AdditionalName,
        string Position,
        int SourceRowNumber);

    private sealed class ImportDepartmentNode(
        string name,
        string normalizedName,
        string? sourceParentName,
        int? sourceRowNumber,
        bool isGeneratedFromParentName)
    {
        public string Name { get; } = name;
        public string NormalizedName { get; } = normalizedName;
        public string? SourceParentName { get; } = sourceParentName;
        public int? SourceRowNumber { get; } = sourceRowNumber;
        public bool IsGeneratedFromParentName { get; } = isGeneratedFromParentName;
        public ImportDepartmentNode? Parent { get; set; }
        public List<ImportDepartmentNode> Children { get; } = [];
        public List<ImportEmployeeNode> Employees { get; } = [];
        public OrganizationDepartment? Entity { get; set; }
        public string Path => $"{Parent?.Path ?? "root"}/{NormalizedName}";
    }
}
