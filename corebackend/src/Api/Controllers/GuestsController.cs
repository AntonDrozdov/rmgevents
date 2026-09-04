using Api.Contracts;
using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Api.Controllers;

[ApiController]
[Route("api/events/{eventId}/guests")]
[Authorize]
public sealed class GuestsController(IGuestService guestService) : ControllerBase
{
    private static GuestDto MapGuest(Application.Entities.Guest guest) =>
        new(
            guest.Id,
            guest.EventId,
            guest.GroupId,
            guest.Group?.Name,
            guest.Name,
            guest.Email,
            guest.Phone,
            guest.Status,
            guest.CreatedAt,
            guest.ApprovedAt,
            guest.Decisions
                .OrderBy(item => item.CreatedAt)
                .Select(item => new GuestDecisionDto(
                    item.Id,
                    item.ActorUserId,
                    item.Action,
                    item.ActorName,
                    item.CreatedAt))
                .ToList());

    [HttpGet]
    public async Task<ActionResult<List<GuestDto>>> GetGuests(long eventId)
    {
        var guests = await guestService.GetGuestsByEventAsync(eventId);
        
        var result = guests.Select(MapGuest).ToList();
        
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
                MapGuest(guest));
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
                await guestService.RejectGuestAsync(guestId, userId);
            }
            
            var guest = await guestService.GetGuestAsync(guestId);
            if (guest == null)
                return NotFound();
            
            return Ok(MapGuest(guest));
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

    [Authorize(Policy = "CanCreateGuest")]
    [HttpPost("{guestId}/submit-for-review")]
    public async Task<ActionResult<GuestDto>> SubmitGuestForReview(long eventId, long guestId)
    {
        var userId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            await guestService.SubmitGuestForReviewAsync(guestId, userId);
            var guest = await guestService.GetGuestAsync(guestId);
            return guest == null ? NotFound() : Ok(MapGuest(guest));
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

    [Authorize(Policy = "CanCreateGuest")]
    [HttpPost("{guestId}/invite")]
    public async Task<ActionResult<GuestDto>> InviteGuest(long eventId, long guestId)
    {
        var userId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            await guestService.InviteGuestAsync(guestId, userId);
            var guest = await guestService.GetGuestAsync(guestId);
            return guest == null ? NotFound() : Ok(MapGuest(guest));
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
    [HttpPost("{guestId}/restore-to-saved")]
    public async Task<ActionResult<GuestDto>> RestoreGuestToSaved(long eventId, long guestId)
    {
        var userId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            await guestService.RestoreGuestToSavedAsync(guestId, userId);
            var guest = await guestService.GetGuestAsync(guestId);
            return guest == null ? NotFound() : Ok(MapGuest(guest));
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

    [Authorize(Policy = "CanCreateGuest")]
    [HttpPut("{guestId}")]
    public async Task<ActionResult<GuestDto>> UpdateGuest(
        long eventId,
        long guestId,
        UpdateGuestRequest request)
    {
        var userId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            await guestService.UpdateGuestAsync(
                guestId,
                userId,
                request.Name,
                request.Email,
                request.Phone,
                request.GroupId);

            var guest = await guestService.GetGuestAsync(guestId);
            return guest == null ? NotFound() : Ok(MapGuest(guest));
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

    [Authorize(Policy = "CanCreateGuest")]
    [HttpDelete("{guestId}")]
    public async Task<IActionResult> DeleteGuest(long eventId, long guestId)
    {
        var userId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            await guestService.DeleteGuestAsync(guestId, userId);
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
