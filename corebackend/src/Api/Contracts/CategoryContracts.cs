using System.ComponentModel.DataAnnotations;

namespace Api.Contracts;

public sealed record CategoryDto(
    long Id,
    long EventId,
    string Name,
    string Color,
    DateTimeOffset CreatedAt);

public sealed record CreateCategoryRequest(
    [Required, StringLength(50)] string Name,
    string Color);

public sealed record UpdateCategoryRequest(
    [Required, StringLength(50)] string Name,
    string Color);
