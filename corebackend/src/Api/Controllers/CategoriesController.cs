using Api.Contracts;
using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Api.Controllers;

[ApiController]
[Route("api/events/{eventId}/categories")]
[Authorize]
public sealed class CategoriesController(ICategoryService categoryService) : ControllerBase
{
    private static CategoryDto MapCategory(Application.Entities.Category category) =>
        new(
            category.Id,
            category.EventId,
            category.Name,
            category.Color,
            category.CreatedAt);

    [HttpGet]
    public async Task<ActionResult<List<CategoryDto>>> GetCategories(long eventId)
    {
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            var categories = await categoryService.GetCategoriesByEventAsync(eventId, loginId);
            return Ok(categories.Select(MapCategory).ToList());
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid(ex.Message);
        }
    }

    [Authorize(Policy = "CanCreateEvent")]
    [HttpPost]
    public async Task<ActionResult<CategoryDto>> CreateCategory(
        long eventId,
        CreateCategoryRequest request)
    {
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            var category = await categoryService.CreateCategoryAsync(
                eventId,
                loginId,
                request.Name,
                request.Color);

            return Created($"/api/events/{eventId}/categories/{category.Id}", MapCategory(category));
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

    [Authorize(Policy = "CanCreateEvent")]
    [HttpPut("{categoryId}")]
    public async Task<ActionResult<CategoryDto>> UpdateCategory(
        long eventId,
        long categoryId,
        UpdateCategoryRequest request)
    {
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            var category = await categoryService.UpdateCategoryAsync(
                eventId,
                categoryId,
                loginId,
                request.Name,
                request.Color);

            return Ok(MapCategory(category));
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

    [Authorize(Policy = "CanCreateEvent")]
    [HttpDelete("{categoryId}")]
    public async Task<IActionResult> DeleteCategory(long eventId, long categoryId)
    {
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            await categoryService.DeleteCategoryAsync(eventId, categoryId, loginId);
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
