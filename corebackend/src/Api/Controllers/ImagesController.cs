using Application.Services;
using Api.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Api.Controllers;

[ApiController]
[Route("api/images")]
public sealed class ImagesController(
    IImageService imageService,
    IEventStateGuard eventStateGuard,
    IEventLogService eventLogService) : ControllerBase
{
    [HttpGet("{id:long}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetImage(long id, CancellationToken cancellationToken)
    {
        var image = await imageService.GetImage(id, cancellationToken);
        if (image is null)
            return NotFound();

        Response.Headers.ContentDisposition = $"inline; filename=\"{image.FileName}\"";
        return File(image.Data, image.ContentType, enableRangeProcessing: true);
    }

    [Authorize(Policy = "CanCreateEvent")]
    [HttpPost("events/{eventId:long}/cover")]
    [ProducesResponseType<ImageUploadResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ImageUploadResponse>> UploadEventCover(
        long eventId,
        [FromForm] IFormFile file,
        CancellationToken cancellationToken)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { message = "Выберите файл обложки." });

        if (file.Length > 5 * 1024 * 1024)
            return BadRequest(new { message = "Размер обложки не должен превышать 5 МБ." });

        try
        {
            await eventStateGuard.EnsureActiveAsync(eventId);

            await using var stream = new MemoryStream();
            await file.CopyToAsync(stream, cancellationToken);
            var image = await imageService.SaveEventCover(
                file.FileName,
                file.ContentType,
                stream.ToArray(),
                cancellationToken);

            var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
            await eventLogService.AddAsync(
                eventId,
                loginId,
                "cover_uploaded",
                "Event",
                eventId,
                "Загружена обложка мероприятия",
                $"Файл: {image.FileName}");

            return Created($"/api/images/{image.Id}", new ImageUploadResponse(image.Id));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [Authorize(Policy = "CanCreateEvent")]
    [HttpPost("events/{eventId:long}/ticket-background")]
    public async Task<ActionResult<ImageUploadResponse>> UploadTicketBackground(long eventId, [FromForm] IFormFile file, CancellationToken cancellationToken)
    {
        if (file == null || file.Length == 0 || file.Length > 3 * 1024 * 1024) return BadRequest(new { message = "Выберите PNG или JPEG размером до 3 МБ." });
        if (Path.GetExtension(file.FileName).ToLowerInvariant() is not ".png" and not ".jpg" and not ".jpeg") return BadRequest(new { message = "Допустимы только PNG и JPEG." });
        await eventStateGuard.EnsureActiveAsync(eventId); await using var stream = new MemoryStream(); await file.CopyToAsync(stream, cancellationToken); var image = await imageService.SaveEventCover(file.FileName, file.ContentType, stream.ToArray(), cancellationToken); return Created($"/api/images/{image.Id}", new ImageUploadResponse(image.Id));
    }
}
