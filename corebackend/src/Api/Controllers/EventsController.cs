using Api.Contracts;
using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Api.Controllers;

[ApiController]
[Route("api/events")]
[Authorize]
public sealed class EventsController(
    IEventService eventService,
    IUserService userService,
    IPermissionService permissionService) : ControllerBase
{
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
        var events = await eventService.GetEventsByOwnerAsync(userId);
        
        var result = events.Select(e => new EventDto(
            e.Id,
            e.Name,
            e.Description,
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
        var userId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var @event = await eventService.CreateEventAsync(userId, request.Name, request.Description, request.LogoImageId);
        
        return Created(
            $"/events/{@event.Id}",
            new EventDto(
                @event.Id,
                @event.Name,
                @event.Description,
                @event.LogoImageId,
                @event.OwnerId,
                @event.CreatedAt,
                @event.IsArchived));
    }
}
