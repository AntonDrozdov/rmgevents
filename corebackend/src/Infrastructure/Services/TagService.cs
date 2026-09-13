using System.Text.RegularExpressions;
using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed partial class TagService(
    ITagRepository tagRepository,
    IPermissionService permissionService,
    IEventStateGuard eventStateGuard,
    IEventLogService eventLogService) : ITagService
{
    public async Task<List<Application.Entities.Tag>> GetTagsByEventAsync(long eventId, long loginId)
    {
        var userGroupId = await permissionService.GetUserGroupInEventAsync(loginId, eventId);
        if (!userGroupId.HasValue)
            throw new UnauthorizedAccessException("User is not assigned to this event");

        return await tagRepository.GetByEventIdAsync(eventId);
    }

    public async Task<Application.Entities.Tag> CreateTagAsync(
        long eventId,
        long loginId,
        string name,
        string color)
    {
        await EnsureCanManageTagsAsync(eventId, loginId);

        var normalizedName = NormalizeName(name);
        var normalizedColor = NormalizeColor(color);
        if (await tagRepository.ExistsByNameAsync(eventId, normalizedName))
            throw new InvalidOperationException("Tag with the same name already exists");

        var tag = new Application.Entities.Tag
        {
            EventId = eventId,
            Name = normalizedName,
            Color = normalizedColor,
            CreatedAt = DateTimeOffset.UtcNow
        };

        await tagRepository.AddAsync(tag);
        await tagRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            eventId,
            loginId,
            "created",
            "Tag",
            tag.Id,
            "Создана метка",
            $"Метка: {tag.Name}");

        return tag;
    }

    public async Task<Application.Entities.Tag> UpdateTagAsync(
        long eventId,
        long tagId,
        long loginId,
        string name,
        string color)
    {
        await EnsureCanManageTagsAsync(eventId, loginId);

        var tag = await tagRepository.GetByIdAsync(tagId);
        if (tag == null || tag.EventId != eventId)
            throw new InvalidOperationException($"Tag {tagId} not found");

        var normalizedName = NormalizeName(name);
        var normalizedColor = NormalizeColor(color);
        if (await tagRepository.ExistsByNameAsync(eventId, normalizedName, tagId))
            throw new InvalidOperationException("Tag with the same name already exists");

        tag.Name = normalizedName;
        tag.Color = normalizedColor;

        await tagRepository.UpdateAsync(tag);
        await tagRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            eventId,
            loginId,
            "updated",
            "Tag",
            tag.Id,
            "Изменена метка",
            $"Метка: {tag.Name}");

        return tag;
    }

    public async Task DeleteTagAsync(long eventId, long tagId, long loginId)
    {
        await EnsureCanManageTagsAsync(eventId, loginId);

        var tag = await tagRepository.GetByIdAsync(tagId);
        if (tag == null || tag.EventId != eventId)
            throw new InvalidOperationException($"Tag {tagId} not found");

        var tagName = tag.Name;

        await tagRepository.DeleteAsync(tagId);
        await tagRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            eventId,
            loginId,
            "deleted",
            "Tag",
            tagId,
            "Удалена метка",
            $"Метка: {tagName}");
    }

    private async Task EnsureCanManageTagsAsync(long eventId, long loginId)
    {
        await eventStateGuard.EnsureActiveAsync(eventId);

        if (!await permissionService.HasPermissionAsync(loginId, eventId, "create_event"))
            throw new UnauthorizedAccessException("No permission to manage tags");
    }

    private static string NormalizeName(string name)
    {
        var normalized = name.Trim();
        if (normalized.Length == 0)
            throw new InvalidOperationException("Tag name is required");
        if (normalized.Length > 255)
            throw new InvalidOperationException("Tag name is too long");

        return normalized;
    }

    private static string NormalizeColor(string color)
    {
        var normalized = color.Trim();
        if (!HexColorRegex().IsMatch(normalized))
            throw new InvalidOperationException("Tag color must be a hex color");

        return normalized.ToUpperInvariant();
    }

    [GeneratedRegex("^#[0-9A-Fa-f]{6}$")]
    private static partial Regex HexColorRegex();
}
