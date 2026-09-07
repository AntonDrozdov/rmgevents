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
    private static string FormatUserName(Application.Entities.User? user)
    {
        if (user == null)
            return string.Empty;

        return string.Join(" ", new[]
        {
            user.Surname,
            user.Name,
            user.AdditionalName
        }.Where(part => !string.IsNullOrWhiteSpace(part)));
    }

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
            FormatUserName(guest.CreatedByUser),
            guest.CreatedByUser?.Role?.Name,
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
    public async Task<ActionResult<PagedResultDto<GuestDto>>> GetGuests(
        long eventId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null,
        [FromQuery] string? status = null)
    {
        var guests = await guestService.GetGuestsPageByEventAsync(eventId, page, pageSize, search, status);
        var result = guests.Items.Select(MapGuest).ToList();

        return Ok(new PagedResultDto<GuestDto>(
            result,
            guests.TotalCount,
            guests.Page,
            guests.PageSize));
    }

    [Authorize(Policy = "CanCreateGuest")]
    [HttpGet("search")]
    public async Task<ActionResult<List<GuestSearchResultDto>>> SearchGuests(
        long eventId,
        [FromQuery] string? name,
        [FromQuery] string? email,
        [FromQuery] string? phone)
    {
        var guests = await guestService.SearchGuestsForEventAsync(eventId, name, email, phone);

        return Ok(guests.Select(guest => new GuestSearchResultDto(
            guest.Id,
            guest.Name,
            guest.Email,
            guest.Phone,
            guest.Event?.Name,
            guest.Group?.Name,
            guest.Status,
            guest.CreatedAt)).ToList());
    }
    
    [Authorize(Policy = "CanCreateGuest")]
    [HttpPost]
    public async Task<ActionResult<GuestDto>> CreateGuest(
        long eventId,
        CreateGuestRequest request)
    {
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        
        try
        {
            var guest = await guestService.CreateGuestAsync(
                eventId,
                loginId,
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
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        
        try
        {
            if (request.Approve)
            {
                await guestService.ApproveGuestAsync(guestId, loginId);
            }
            else
            {
                await guestService.RejectGuestAsync(guestId, loginId);
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
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            await guestService.SubmitGuestForReviewAsync(guestId, loginId);
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
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            await guestService.InviteGuestAsync(guestId, loginId);
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
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            await guestService.RestoreGuestToSavedAsync(guestId, loginId);
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
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            await guestService.UpdateGuestAsync(
                guestId,
                loginId,
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
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            await guestService.DeleteGuestAsync(guestId, loginId);
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
