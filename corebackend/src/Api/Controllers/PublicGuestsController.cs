using Api.Contracts;
using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/public/guests")]
public sealed class PublicGuestsController(IGuestService guestService) : ControllerBase
{
    [HttpGet("{publicId:guid}")]
    public async Task<ActionResult<PublicGuestDto>> GetGuest(Guid publicId)
    {
        var guest = await guestService.GetGuestByPublicIdAsync(publicId);
        if (guest == null) return NotFound();
        return Ok(new PublicGuestDto(
            guest.Name, guest.Email, guest.Phone, guest.Group?.Name,
            guest.GuestCategory?.Category?.Name, guest.GuestCategory?.Category?.Color,
            guest.GuestTags.Where(tag => tag.Tag != null).OrderBy(tag => tag.Tag!.Name)
                .Select(tag => new GuestTagDto(tag.TagId, tag.Tag!.Name, tag.Tag.Color)).ToList(),
            guest.Status, guest.CreatedAt));
    }
}
