using Api.Contracts;
using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Api.Controllers;

[ApiController]
[Route("api/events/{eventId}/tags")]
[Authorize]
public sealed class TagsController(ITagService tagService) : ControllerBase
{
    private static TagDto MapTag(Application.Entities.Tag tag) =>
        new(
            tag.Id,
            tag.EventId,
            tag.Name,
            tag.Color,
            tag.CreatedAt);

    [HttpGet]
    public async Task<ActionResult<List<TagDto>>> GetTags(long eventId)
    {
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            var tags = await tagService.GetTagsByEventAsync(eventId, loginId);
            return Ok(tags.Select(MapTag).ToList());
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid(ex.Message);
        }
    }

    [Authorize(Policy = "CanCreateEvent")]
    [HttpPost]
    public async Task<ActionResult<TagDto>> CreateTag(
        long eventId,
        CreateTagRequest request)
    {
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            var tag = await tagService.CreateTagAsync(
                eventId,
                loginId,
                request.Name,
                request.Color);

            return Created($"/api/events/{eventId}/tags/{tag.Id}", MapTag(tag));
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [Authorize(Policy = "CanCreateEvent")]
    [HttpPut("{tagId}")]
    public async Task<ActionResult<TagDto>> UpdateTag(
        long eventId,
        long tagId,
        UpdateTagRequest request)
    {
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            var tag = await tagService.UpdateTagAsync(
                eventId,
                tagId,
                loginId,
                request.Name,
                request.Color);

            return Ok(MapTag(tag));
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [Authorize(Policy = "CanCreateEvent")]
    [HttpDelete("{tagId}")]
    public async Task<IActionResult> DeleteTag(long eventId, long tagId)
    {
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            await tagService.DeleteTagAsync(eventId, tagId, loginId);
            return NoContent();
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }
}
