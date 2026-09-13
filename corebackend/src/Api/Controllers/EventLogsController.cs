using Api.Contracts;
using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Api.Controllers;

[ApiController]
[Route("api/events/{eventId:long}/logs")]
[Authorize]
public sealed class EventLogsController(IEventLogService eventLogService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResultDto<EventLogDto>>> GetLogs(
        long eventId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] long? userId = null,
        [FromQuery] string? action = null,
        [FromQuery] string? entityType = null,
        [FromQuery] string? search = null,
        [FromQuery] DateTimeOffset? dateFrom = null,
        [FromQuery] DateTimeOffset? dateTo = null)
    {
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            var logs = await eventLogService.GetPageByEventIdAsync(
                eventId,
                loginId,
                page,
                pageSize,
                userId,
                action,
                entityType,
                search,
                dateFrom,
                dateTo);

            return Ok(new PagedResultDto<EventLogDto>(
                logs.Items.Select(MapLog).ToList(),
                logs.TotalCount,
                logs.Page,
                logs.PageSize));
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid(ex.Message);
        }
    }

    [HttpGet("filter-options")]
    public async Task<ActionResult<EventLogFilterOptionsDto>> GetFilterOptions(long eventId)
    {
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            var options = await eventLogService.GetFilterOptionsAsync(eventId, loginId);
            return Ok(new EventLogFilterOptionsDto(
                options.Users.Select(user => new EventLogUserFilterOptionDto(user.UserId, user.Name)).ToList(),
                options.Actions,
                options.EntityTypes));
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid(ex.Message);
        }
    }

    private static EventLogDto MapLog(Application.Entities.EventLog log) =>
        new(
            log.Id,
            log.EventId,
            log.UserId,
            log.ActorName,
            log.ActorRoleName,
            log.Action,
            log.EntityType,
            log.EntityId,
            log.Title,
            log.Description,
            log.CreatedAt);
}
