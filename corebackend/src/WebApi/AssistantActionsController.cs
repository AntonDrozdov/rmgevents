using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace WebApi;

public sealed record AssistantDecision([Range(1, long.MaxValue)] long? EventId, bool Confirm);

[ApiController, Authorize, Route("api/assistant/actions"), EnableRateLimiting("assistant")]
public sealed class AssistantActionsController(AssistantActions actions, ILogger<AssistantActionsController> logger) : ControllerBase
{
    [HttpPost("{id}/decision")]
    [RequestSizeLimit(2000)]
    public async Task<IActionResult> Decide(string id, AssistantDecision decision, CancellationToken ct)
    {
        if (id.Length != 48 || !id.All(Uri.IsHexDigit)) return BadRequest(new { message = "Некорректный идентификатор предложения." });
        if (!long.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var loginId)) return Unauthorized();
        try { return Ok(await actions.DecideAsync(id, loginId, decision.EventId, decision.Confirm, ct)); }
        catch (AssistantActionException ex) { return StatusCode(ex.Status, new { message = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { message = ex.Message }); }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError("Assistant action failed for event {EventId}: {ErrorType}", decision.EventId, ex.GetType().Name);
            return StatusCode(500, new { message = "Не удалось подтвердить сохранение. Проверьте данные мероприятия перед повторной попыткой." });
        }
    }
}
