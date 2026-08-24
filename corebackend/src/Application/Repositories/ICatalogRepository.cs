using Application.Entities;

namespace Application.Repositories;

public interface ICatalogRepository
{
    Task<IReadOnlyList<Category>> GetCategories(CancellationToken cancellationToken = default);
    Task<Category?> GetCategory(Guid id, CancellationToken cancellationToken = default);
    Task<Category?> GetCategoryForUpdate(Guid id, CancellationToken cancellationToken = default);
    Task<Product?> GetProductForUpdate(Guid id, CancellationToken cancellationToken = default);
    void AddCategory(Category category);
    void AddProduct(Product product);
    void AddImage(ImageEntity image);
    void RemoveCategory(Category category);
    void RemoveProduct(Product product);
    void RemoveImage(ImageEntity image);
    Task<ImageEntity?> GetImageForUpdate(Guid id, CancellationToken cancellationToken = default);
    Task SaveChanges(CancellationToken cancellationToken = default);
}
