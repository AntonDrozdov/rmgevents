using Api.Contracts;
using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Api.Controllers;

[ApiController]
[Route("api/events/{eventId}/guests")]
[Authorize]
public sealed class GuestsController(
    IGuestService guestService,
    IPermissionService permissionService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<GuestDto>>> GetGuests(long eventId)
    {
        var guests = await guestService.GetGuestsByEventAsync(eventId);
        
        var result = guests.Select(g => new GuestDto(
            g.Id,
            g.EventId,
            g.GroupId,
            g.Name,
            g.Email,
            g.Phone,
            g.Status,
            g.CreatedAt,
            g.ApprovedAt))
            .ToList();
        
        return Ok(result);
    }
    
    [Authorize(Policy = "CanCreateGuest")]
    [HttpPost]
    public async Task<ActionResult<GuestDto>> CreateGuest(
        long eventId,
        CreateGuestRequest request)
    {
        var userId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        
        try
        {
            var guest = await guestService.CreateGuestAsync(
                eventId,
                userId,
                request.Name,
                request.Email,
                request.Phone,
                request.GroupId);
            
            return Created(
                $"/guests/{guest.Id}",
                new GuestDto(
                    guest.Id,
                    guest.EventId,
                    guest.GroupId,
                    guest.Name,
                    guest.Email,
                    guest.Phone,
                    guest.Status,
                    guest.CreatedAt,
                    guest.ApprovedAt));
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
    
    [Authorize(Policy = "CanApproveGuest")]
    [HttpPost("{guestId}/approve")]
    public async Task<ActionResult<GuestDto>> ApproveGuest(
        long eventId,
        long guestId,
        ApproveGuestRequest request)
    {
        var userId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        
        try
        {
            if (request.Approve)
            {
                await guestService.ApproveGuestAsync(guestId, userId);
            }
            else
            {
                await guestService.RejectGuestAsync(guestId);
            }
            
            var guest = await guestService.GetGuestAsync(guestId);
            if (guest == null)
                return NotFound();
            
            return Ok(new GuestDto(
                guest.Id,
                guest.EventId,
                guest.GroupId,
                guest.Name,
                guest.Email,
                guest.Phone,
                guest.Status,
                guest.CreatedAt,
                guest.ApprovedAt));
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
