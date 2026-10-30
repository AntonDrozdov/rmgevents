using Application.Services;
using Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Api.Controllers;

[ApiController, Authorize, Route("api/events/{eventId}/placements")]
public sealed class PlacementsController(PlacementService service, PlacementEditLockService editLockService) : ControllerBase
{
    private long LoginId => long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private Guid? EditLockToken => Guid.TryParse(Request.Headers["X-Placement-Edit-Token"].FirstOrDefault(), out var token) ? token : null;

    private async Task<IActionResult> Run(long eventId, bool write, Func<Task<object>> action)
    {
        try
        {
            await service.CheckAccess(eventId, LoginId, write);
            return Ok(await action());
        }
        catch (UnauthorizedAccessException) { return Forbid(); }
        catch (PlacementEditLockException ex) { return Conflict(ex.Message); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    private Task<IActionResult> RunStructureWrite(long eventId, Func<Task<object>> action) => Run(eventId, true, async () =>
        await service.Transaction(eventId, async () =>
        {
            await editLockService.EnsureOwned(eventId, LoginId, EditLockToken);
            return await action();
        }));

    [HttpGet] public Task<IActionResult> List(long eventId) => Run(eventId, false, async () => await service.List(eventId));
    [HttpPost] public Task<IActionResult> Create(long eventId, PlacementInput input) => RunStructureWrite(eventId, async () => await service.Create(eventId, input));
    [HttpPut("{id:long}")] public Task<IActionResult> Update(long eventId, long id, PlacementInput input) => RunStructureWrite(eventId, async () => await service.Update(eventId, id, input));
    public sealed record SeatLabelRequest(string? Label);
    [HttpPut("{id:long}/seats/{seatNumber:int}/label")] public Task<IActionResult> UpdateSeatLabel(long eventId, long id, int seatNumber, SeatLabelRequest input) => Run(eventId, true, async () => await service.UpdateSeatLabel(eventId, id, seatNumber, input.Label));
    [HttpPut("batches/{batchId:guid}")] public Task<IActionResult> UpdateBatch(long eventId, Guid batchId, PlacementInput input) => RunStructureWrite(eventId, async () => await service.UpdateRowBatch(eventId, batchId, input));
    [HttpPut("rows/rotation")] public Task<IActionResult> RotateRows(long eventId, PlacementService.RowRotation[] input) => RunStructureWrite(eventId, async () => await service.RotateRows(eventId, input));
    public sealed record GroupRowsRequest(long[] Ids);
    public sealed record CopyPlacementsRequest(long[] Ids);
    [HttpPost("copy")] public Task<IActionResult> Copy(long eventId, CopyPlacementsRequest input) => RunStructureWrite(eventId, async () => await service.Copy(eventId, input.Ids));
    [HttpPost("rows/group")] public Task<IActionResult> GroupRows(long eventId, GroupRowsRequest input) => RunStructureWrite(eventId, async () => await service.GroupRows(eventId, input.Ids));
    [HttpPost("rows/batches/{batchId:guid}/ungroup")] public Task<IActionResult> UngroupRows(long eventId, Guid batchId) => RunStructureWrite(eventId, async () => await service.UngroupRows(eventId, batchId));
    [HttpDelete("{id:long}")] public Task<IActionResult> Delete(long eventId, long id, [FromQuery] bool confirmed = false) => RunStructureWrite(eventId, async () => await service.Delete(eventId, id, confirmed));
    [HttpDelete] public Task<IActionResult> Reset(long eventId, [FromQuery] bool confirmed = false) => RunStructureWrite(eventId, async () => await service.Delete(eventId, null, confirmed));
    [HttpGet("guests")] public Task<IActionResult> Guests(long eventId, [FromQuery] long groupId) => Run(eventId, false, async () => {
        await service.CheckAccess(eventId, long.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!), true);
        return await service.Guests(eventId, groupId);
    });
    [HttpGet("seated-guests")] public Task<IActionResult> SeatedGuests(long eventId) => Run(eventId, false, async () => await service.SeatedGuests(eventId));
    public sealed record AssignRequest(bool Remove = false);
    [HttpPut("{id:long}/guests/{guestId:long}")] public Task<IActionResult> Assign(long eventId, long id, long guestId, AssignRequest input) => Run(eventId, true, async () => await service.Assign(eventId, id, guestId, input.Remove));
    [HttpGet("templates")] public Task<IActionResult> Templates(long eventId) => Run(eventId, false, async () => await service.Templates());
    public sealed record TemplateRequest(string Name);
    [HttpPost("templates")] public Task<IActionResult> SaveTemplate(long eventId, TemplateRequest input) => Run(eventId, true, async () => await service.SaveTemplate(eventId, input.Name));
    [HttpPost("templates/{id:long}/apply")] public Task<IActionResult> Apply(long eventId, long id, [FromQuery] bool confirmed = false) => RunStructureWrite(eventId, async () => await service.ApplyTemplate(eventId, id, confirmed));

    [HttpGet("edit-lock")] public Task<IActionResult> EditLockStatus(long eventId) => Run(eventId, false, async () => await editLockService.Status(eventId, LoginId));
    [HttpPost("edit-lock/acquire")] public Task<IActionResult> AcquireEditLock(long eventId) => Run(eventId, true, async () => await editLockService.Acquire(eventId, LoginId));
    [HttpPost("edit-lock/heartbeat")] public Task<IActionResult> HeartbeatEditLock(long eventId) => Run(eventId, true, async () => await editLockService.Heartbeat(eventId, LoginId, EditLockToken));
    [HttpPost("edit-lock/takeover")] public Task<IActionResult> TakeoverEditLock(long eventId) => Run(eventId, true, async () => await editLockService.Takeover(eventId, LoginId));
    [HttpDelete("edit-lock")] public Task<IActionResult> ReleaseEditLock(long eventId) => Run(eventId, true, async () => await editLockService.Release(eventId, LoginId, EditLockToken));
}
