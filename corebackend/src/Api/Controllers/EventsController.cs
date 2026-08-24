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
    IPermissionService permissionService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<EventDto>>> GetAvailableEvents()
    {
        var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var events = await eventService.GetEventsByOwnerAsync(userId);
        
        var result = events.Select(e => new EventDto(
            e.Id,
            e.Name,
            e.Description,
            e.OwnerId,
            e.CreatedAt,
            e.IsArchived))
            .ToList();
        
        return Ok(result);
    }
    
    [HttpGet("{eventId}")]
    public async Task<ActionResult<EventDetailDto>> GetEvent(Guid eventId)
    {
        var @event = await eventService.GetEventAsync(eventId);
        if (@event == null)
            return NotFound();
        
        var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var permissions = await permissionService.GetUserPermissionsAsync(userId, eventId);
        
        var userProfile = new UserProfileDto(
            userId,
            "User",
            "Role",
            Guid.Empty,
            permissions);
        
        return Ok(new EventDetailDto(
            @event.Id,
            @event.Name,
            @event.Description,
            @event.OwnerId,
            @event.CreatedAt,
            userProfile));
    }
    
    [HttpGet("{eventId}/me")]
    public async Task<ActionResult<UserProfileDto>> GetCurrentUserProfile(Guid eventId)
    {
        var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var permissions = await permissionService.GetUserPermissionsAsync(userId, eventId);
        
        var userProfile = new UserProfileDto(
            userId,
            "User",
            "Role",
            Guid.Empty,
            permissions);
        
        return Ok(userProfile);
    }
    
    [Authorize(Policy = "CanCreateEvent")]
    [HttpPost]
    public async Task<ActionResult<EventDto>> CreateEvent(CreateEventRequest request)
    {
        var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var @event = await eventService.CreateEventAsync(userId, request.Name, request.Description);
        
        return Created(
            $"/events/{@event.Id}",
            new EventDto(
                @event.Id,
                @event.Name,
                @event.Description,
                @event.OwnerId,
                @event.CreatedAt,
                @event.IsArchived));
    }
}
