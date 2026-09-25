using Application.Services;
using Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Api.Controllers;

[ApiController, Authorize, Route("api/events/{eventId}/placements")]
public sealed class PlacementsController(PlacementService service) : ControllerBase
{
    private async Task<IActionResult> Run(long eventId, bool write, Func<Task<object>> action)
    {
        try
        {
            await service.CheckAccess(eventId, long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!), write);
            return Ok(await action());
        }
        catch (UnauthorizedAccessException) { return Forbid(); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    [HttpGet] public Task<IActionResult> List(long eventId) => Run(eventId, false, async () => await service.List(eventId));
    [HttpPost] public Task<IActionResult> Create(long eventId, PlacementInput input) => Run(eventId, true, async () => await service.Create(eventId, input));
    [HttpPut("{id:long}")] public Task<IActionResult> Update(long eventId, long id, PlacementInput input) => Run(eventId, true, async () => await service.Update(eventId, id, input));
    [HttpDelete("{id:long}")] public Task<IActionResult> Delete(long eventId, long id, [FromQuery] bool confirmed = false) => Run(eventId, true, async () => await service.Delete(eventId, id, confirmed));
    [HttpDelete] public Task<IActionResult> Reset(long eventId, [FromQuery] bool confirmed = false) => Run(eventId, true, async () => await service.Delete(eventId, null, confirmed));
    [HttpGet("guests")] public Task<IActionResult> Guests(long eventId, [FromQuery] long groupId) => Run(eventId, false, async () => {
        await service.CheckAccess(eventId, long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!), true);
        return await service.Guests(eventId, groupId);
    });
    public sealed record AssignRequest(bool Remove = false);
    [HttpPut("{id:long}/guests/{guestId:long}")] public Task<IActionResult> Assign(long eventId, long id, long guestId, AssignRequest input) => Run(eventId, true, async () => await service.Assign(eventId, id, guestId, input.Remove));
    [HttpGet("templates")] public Task<IActionResult> Templates(long eventId) => Run(eventId, false, async () => await service.Templates());
    public sealed record TemplateRequest(string Name);
    [HttpPost("templates")] public Task<IActionResult> SaveTemplate(long eventId, TemplateRequest input) => Run(eventId, true, async () => await service.SaveTemplate(eventId, input.Name));
    [HttpPost("templates/{id:long}/apply")] public Task<IActionResult> Apply(long eventId, long id, [FromQuery] bool confirmed = false) => Run(eventId, true, async () => await service.ApplyTemplate(eventId, id, confirmed));
}
