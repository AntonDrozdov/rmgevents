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
    [HttpPut("batches/{batchId:guid}")] public Task<IActionResult> UpdateBatch(long eventId, Guid batchId, PlacementInput input) => Run(eventId, true, async () => await service.UpdateRowBatch(eventId, batchId, input));
    public sealed record GroupRowsRequest(long[] Ids);
    public sealed record CopyPlacementsRequest(long[] Ids);
    [HttpPost("copy")] public Task<IActionResult> Copy(long eventId, CopyPlacementsRequest input) => Run(eventId, true, async () => await service.Copy(eventId, input.Ids));
    [HttpPost("rows/group")] public Task<IActionResult> GroupRows(long eventId, GroupRowsRequest input) => Run(eventId, true, async () => await service.GroupRows(eventId, input.Ids));
    [HttpPost("rows/batches/{batchId:guid}/ungroup")] public Task<IActionResult> UngroupRows(long eventId, Guid batchId) => Run(eventId, true, async () => await service.UngroupRows(eventId, batchId));
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
