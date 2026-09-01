using Api.Contracts;
using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System.Security.Claims;

namespace Api.Controllers;

[ApiController]
[Route("api/events")]
[Authorize]
public sealed class EventsController(
    IEventService eventService,
    IUserService userService,
    IPermissionService permissionService,
    ILogger<EventsController> logger) : ControllerBase
{
    private static string FormatUserName(Application.Entities.User? user) =>
        user == null
            ? "—"
            : string.Join(" ", new[] { user.Surname, user.Name, user.AdditionalName }
                .Where(part => !string.IsNullOrWhiteSpace(part)));

    private static UserProfileDto MapProfile(Application.Entities.User user, List<string> permissions) =>
        new(
            user.Id,
            user.Login?.LoginValue ?? string.Empty,
            user.Name,
            user.Surname,
            user.AdditionalName,
            user.Email,
            user.Tel,
            user.Role?.Name ?? string.Empty,
            user.GroupId,
            permissions);

    [HttpGet]
    public async Task<ActionResult<List<EventDto>>> GetAvailableEvents()
    {
        var userId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var events = await eventService.GetEventsByUserAsync(userId);
        
        var result = events.Select(e => new EventDto(
            e.Id,
            e.Name,
            e.Description,
            e.EventDate,
            FormatUserName(e.Owner),
            e.LogoImageId,
            e.OwnerId,
            e.CreatedAt,
            e.IsArchived))
            .ToList();
        
        return Ok(result);
    }
    
    [HttpGet("{eventId}")]
    public async Task<ActionResult<EventDetailDto>> GetEvent(long eventId)
    {
        var @event = await eventService.GetEventAsync(eventId);
        if (@event == null)
            return NotFound();
        
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var user = await userService.GetUserByLoginAndEventAsync(loginId, eventId);
        if (user == null)
            return Forbid();

        var permissions = await permissionService.GetUserPermissionsAsync(user.Id, eventId);
        
        var userProfile = MapProfile(user, permissions);
        
        return Ok(new EventDetailDto(
            @event.Id,
            @event.Name,
            @event.Description,
            @event.EventDate,
            FormatUserName(@event.Owner),
            @event.LogoImageId,
            @event.OwnerId,
            @event.CreatedAt,
            userProfile));
    }
    
    [HttpGet("{eventId}/me")]
    public async Task<ActionResult<UserProfileDto>> GetCurrentUserProfile(long eventId)
    {
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var user = await userService.GetUserByLoginAndEventAsync(loginId, eventId);
        if (user == null)
            return Forbid();

        var permissions = await permissionService.GetUserPermissionsAsync(user.Id, eventId);
        
        var userProfile = MapProfile(user, permissions);
        
        return Ok(userProfile);
    }
    
    [Authorize(Policy = "CanCreateEvent")]
    [HttpPost]
    public async Task<ActionResult<EventDto>> CreateEvent(CreateEventRequest request)
    {
        if (request.EventDate == default)
            return BadRequest(new { message = "Дата мероприятия обязательна." });

        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            var @event = await eventService.CreateEventAsync(
                loginId,
                request.Name,
                request.EventDate,
                request.LogoImageId);

            return Created(
                $"/events/{@event.Id}",
                new EventDto(
                    @event.Id,
                    @event.Name,
                    @event.Description,
                    @event.EventDate,
                    FormatUserName(@event.Owner),
                    @event.LogoImageId,
                    @event.OwnerId,
                    @event.CreatedAt,
                    @event.IsArchived));
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "Event creation was rejected for login {LoginId}", loginId);
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Event creation failed for login {LoginId}", loginId);
            return BadRequest(new { message = "Не удалось создать мероприятие. Проверьте введённые данные." });
        }
    }

    [Authorize(Policy = "CanCreateEvent")]
    [HttpPut("{eventId:long}")]
    public async Task<ActionResult<EventDto>> UpdateEvent(long eventId, UpdateEventRequest request)
    {
        try
        {
            var @event = await eventService.UpdateEventAsync(
                eventId,
                request.Name,
                request.Description,
                request.EventDate,
                request.LogoImageId);

            return Ok(new EventDto(
                @event.Id,
                @event.Name,
                @event.Description,
                @event.EventDate,
                FormatUserName(@event.Owner),
                @event.LogoImageId,
                @event.OwnerId,
                @event.CreatedAt,
                @event.IsArchived));
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "Event update was rejected for event {EventId}", eventId);
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Event update failed for event {EventId}", eventId);
            return BadRequest(new { message = "Не удалось сохранить настройки мероприятия." });
        }
    }
}
