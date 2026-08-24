using Api.Contracts;
using Application.Entities;
using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers;

[ApiController]
[Route("api/categories")]
public sealed class CatalogController(ICatalogService catalogService) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CategoryResponse>>> GetCategories(CancellationToken cancellationToken)
        => Ok((await catalogService.GetCategories(cancellationToken)).Select(ToResponse));

    [AllowAnonymous]
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<CategoryResponse>> GetCategory(Guid id, CancellationToken cancellationToken)
    {
        var category = await catalogService.GetCategory(id, cancellationToken);
        return category is null ? NotFound() : Ok(ToResponse(category));
    }

    [Authorize(Roles = "Admin")]
    [HttpPost]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<CategoryResponse>> CreateCategory([FromForm] CreateCatalogItemRequest request,
        CancellationToken cancellationToken)
    {
        var image = await ReadImage(request.Image!, cancellationToken);
        if (image is null) return BadRequest("Only image files up to 10 MB are allowed.");
        var category = await catalogService.CreateCategory(request.Name, request.Description,
            request.Image!.FileName, request.Image.ContentType, image, cancellationToken);
        return CreatedAtAction(nameof(GetCategory), new { id = category.Id }, ToResponse(category));
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("{id:guid}")]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<CategoryResponse>> UpdateCategory(Guid id,
        [FromForm] UpdateCatalogItemRequest request, CancellationToken cancellationToken)
    {
        var image = request.Image is null ? null : await ReadImage(request.Image, cancellationToken);
        if (request.Image is not null && image is null) return BadRequest("Only image files up to 10 MB are allowed.");
        var category = await catalogService.UpdateCategory(id, request.Name, request.Description,
            request.Image?.FileName, request.Image?.ContentType, image, cancellationToken);
        return category is null ? NotFound() : Ok(ToResponse(category));
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteCategory(Guid id, CancellationToken cancellationToken)
        => await catalogService.DeleteCategory(id, cancellationToken) ? NoContent() : NotFound();

    [Authorize(Roles = "Admin")]
    [HttpPost("{categoryId:guid}/products")]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<ProductResponse>> CreateProduct(Guid categoryId,
        [FromForm] CreateCatalogItemRequest request, CancellationToken cancellationToken)
    {
        var image = await ReadImage(request.Image!, cancellationToken);
        if (image is null) return BadRequest("Only image files up to 10 MB are allowed.");
        var product = await catalogService.CreateProduct(categoryId, request.Name, request.Description,
            request.Image!.FileName, request.Image.ContentType, image, cancellationToken);
        return product is null ? NotFound() : Ok(ToResponse(product));
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("products/{id:guid}")]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<ProductResponse>> UpdateProduct(Guid id,
        [FromForm] UpdateCatalogItemRequest request, CancellationToken cancellationToken)
    {
        var image = request.Image is null ? null : await ReadImage(request.Image, cancellationToken);
        if (request.Image is not null && image is null) return BadRequest("Only image files up to 10 MB are allowed.");
        var product = await catalogService.UpdateProduct(id, request.Name, request.Description,
            request.Image?.FileName, request.Image?.ContentType, image, cancellationToken);
        return product is null ? NotFound() : Ok(ToResponse(product));
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("products/{id:guid}")]
    public async Task<IActionResult> DeleteProduct(Guid id, CancellationToken cancellationToken)
        => await catalogService.DeleteProduct(id, cancellationToken) ? NoContent() : NotFound();

    private static async Task<byte[]?> ReadImage(IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length is <= 0 or > 10 * 1024 * 1024 || !file.ContentType.StartsWith("image/")) return null;
        await using var stream = new MemoryStream();
        await file.CopyToAsync(stream, cancellationToken);
        return stream.ToArray();
    }

    private static CategoryResponse ToResponse(Category category) => new(category.Id, category.Name,
        category.Description, $"/api/images/{category.ImageId}", category.CreatedAt,
        category.Products.OrderBy(product => product.Name).Select(ToResponse).ToArray());

    private static ProductResponse ToResponse(Product product) => new(product.Id, product.CategoryId,
        product.Name, product.Description, $"/api/images/{product.ImageId}", product.CreatedAt);
}
