using Application.Entities;
using Application.Repositories;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public sealed class CatalogRepository(ApplicationDbContext dbContext) : ICatalogRepository
{
    public async Task<IReadOnlyList<Category>> GetCategories(CancellationToken cancellationToken = default)
        => await dbContext.Categories.AsNoTracking().Include(category => category.Products)
            .OrderBy(category => category.Name).ToListAsync(cancellationToken);

    public Task<Category?> GetCategory(Guid id, CancellationToken cancellationToken = default)
        => dbContext.Categories.AsNoTracking().Include(category => category.Products)
            .SingleOrDefaultAsync(category => category.Id == id, cancellationToken);

    public Task<Category?> GetCategoryForUpdate(Guid id, CancellationToken cancellationToken = default)
        => dbContext.Categories.Include(category => category.Products)
            .SingleOrDefaultAsync(category => category.Id == id, cancellationToken);

    public Task<Product?> GetProductForUpdate(Guid id, CancellationToken cancellationToken = default)
        => dbContext.Products.SingleOrDefaultAsync(product => product.Id == id, cancellationToken);

    public Task<ImageEntity?> GetImageForUpdate(Guid id, CancellationToken cancellationToken = default)
        => dbContext.Images.SingleOrDefaultAsync(image => image.Id == id, cancellationToken);

    public void AddCategory(Category category) => dbContext.Categories.Add(category);
    public void AddProduct(Product product) => dbContext.Products.Add(product);
    public void AddImage(ImageEntity image) => dbContext.Images.Add(image);
    public void RemoveCategory(Category category) => dbContext.Categories.Remove(category);
    public void RemoveProduct(Product product) => dbContext.Products.Remove(product);
    public void RemoveImage(ImageEntity image) => dbContext.Images.Remove(image);
    public Task SaveChanges(CancellationToken cancellationToken = default) => dbContext.SaveChangesAsync(cancellationToken);
}
