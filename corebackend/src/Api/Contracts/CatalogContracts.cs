using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Http;

namespace Api.Contracts;

public sealed class CreateCatalogItemRequest
{
    [Required, MaxLength(200)] public string Name { get; init; } = string.Empty;
    [Required, MaxLength(4000)] public string Description { get; init; } = string.Empty;
    [Required] public IFormFile? Image { get; init; }
}

public sealed class UpdateCatalogItemRequest
{
    [Required, MaxLength(200)] public string Name { get; init; } = string.Empty;
    [Required, MaxLength(4000)] public string Description { get; init; } = string.Empty;
    public IFormFile? Image { get; init; }
}

public sealed record ProductResponse(Guid Id, Guid CategoryId, string Name, string Description,
    string ImageUrl, DateTimeOffset CreatedAt);

public sealed record CategoryResponse(Guid Id, string Name, string Description, string ImageUrl,
    DateTimeOffset CreatedAt, IReadOnlyList<ProductResponse> Products);
