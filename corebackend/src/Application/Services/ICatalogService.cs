using Application.Entities;

namespace Application.Services;

public interface ICatalogService
{
    Task<IReadOnlyList<Category>> GetCategories(CancellationToken cancellationToken = default);
    Task<Category?> GetCategory(Guid id, CancellationToken cancellationToken = default);
    Task<Category> CreateCategory(string name, string description, string fileName, string contentType, byte[] imageData, CancellationToken cancellationToken = default);
    Task<Category?> UpdateCategory(Guid id, string name, string description, string? fileName, string? contentType, byte[]? imageData, CancellationToken cancellationToken = default);
    Task<bool> DeleteCategory(Guid id, CancellationToken cancellationToken = default);
    Task<Product?> CreateProduct(Guid categoryId, string name, string description, string fileName, string contentType, byte[] imageData, CancellationToken cancellationToken = default);
    Task<Product?> UpdateProduct(Guid id, string name, string description, string? fileName, string? contentType, byte[]? imageData, CancellationToken cancellationToken = default);
    Task<bool> DeleteProduct(Guid id, CancellationToken cancellationToken = default);
}
