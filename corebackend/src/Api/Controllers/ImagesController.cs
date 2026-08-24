using Application.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers;

[ApiController]
[Route("api/images")]
public sealed class ImagesController(IImageService imageService) : ControllerBase
{
    [HttpGet("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetImage(Guid id, CancellationToken cancellationToken)
    {
        var image = await imageService.GetImage(id, cancellationToken);
        if (image is null)
            return NotFound();

        Response.Headers.ContentDisposition = $"inline; filename=\"{image.FileName}\"";
        return File(image.Data, image.ContentType, enableRangeProcessing: true);
    }
}
