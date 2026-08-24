using Application.Entities;
using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed class CatalogService(ICatalogRepository repository) : ICatalogService
{
    public Task<IReadOnlyList<Category>> GetCategories(CancellationToken cancellationToken = default)
        => repository.GetCategories(cancellationToken);

    public Task<Category?> GetCategory(Guid id, CancellationToken cancellationToken = default)
        => repository.GetCategory(id, cancellationToken);

    public async Task<Category> CreateCategory(string name, string description, string fileName,
        string contentType, byte[] imageData, CancellationToken cancellationToken = default)
    {
        var image = CreateImage(fileName, contentType, imageData, name);
        var category = new Category
        {
            Id = Guid.NewGuid(), Name = name.Trim(), Description = description.Trim(),
            ImageId = image.Id, CreatedAt = DateTimeOffset.UtcNow
        };
        repository.AddImage(image);
        repository.AddCategory(category);
        await repository.SaveChanges(cancellationToken);
        return category;
    }

    public async Task<Category?> UpdateCategory(Guid id, string name, string description, string? fileName,
        string? contentType, byte[]? imageData, CancellationToken cancellationToken = default)
    {
        var category = await repository.GetCategoryForUpdate(id, cancellationToken);
        if (category is null) return null;
        category.Name = name.Trim();
        category.Description = description.Trim();
        if (imageData is not null && fileName is not null && contentType is not null)
            await ReplaceImage(category.ImageId, newId => category.ImageId = newId, fileName, contentType, imageData, name, cancellationToken);
        await repository.SaveChanges(cancellationToken);
        return category;
    }

    public async Task<bool> DeleteCategory(Guid id, CancellationToken cancellationToken = default)
    {
        var category = await repository.GetCategoryForUpdate(id, cancellationToken);
        if (category is null) return false;
        var images = new List<ImageEntity>();
        var categoryImage = await repository.GetImageForUpdate(category.ImageId, cancellationToken);
        if (categoryImage is not null) images.Add(categoryImage);
        foreach (var product in category.Products)
        {
            var productImage = await repository.GetImageForUpdate(product.ImageId, cancellationToken);
            if (productImage is not null) images.Add(productImage);
        }
        repository.RemoveCategory(category);
        foreach (var image in images) repository.RemoveImage(image);
        await repository.SaveChanges(cancellationToken);
        return true;
    }

    public async Task<Product?> CreateProduct(Guid categoryId, string name, string description, string fileName,
        string contentType, byte[] imageData, CancellationToken cancellationToken = default)
    {
        if (await repository.GetCategoryForUpdate(categoryId, cancellationToken) is null) return null;
        var image = CreateImage(fileName, contentType, imageData, name);
        var product = new Product
        {
            Id = Guid.NewGuid(), CategoryId = categoryId, Name = name.Trim(), Description = description.Trim(),
            ImageId = image.Id, CreatedAt = DateTimeOffset.UtcNow
        };
        repository.AddImage(image);
        repository.AddProduct(product);
        await repository.SaveChanges(cancellationToken);
        return product;
    }

    public async Task<Product?> UpdateProduct(Guid id, string name, string description, string? fileName,
        string? contentType, byte[]? imageData, CancellationToken cancellationToken = default)
    {
        var product = await repository.GetProductForUpdate(id, cancellationToken);
        if (product is null) return null;
        product.Name = name.Trim();
        product.Description = description.Trim();
        if (imageData is not null && fileName is not null && contentType is not null)
            await ReplaceImage(product.ImageId, newId => product.ImageId = newId, fileName, contentType, imageData, name, cancellationToken);
        await repository.SaveChanges(cancellationToken);
        return product;
    }

    public async Task<bool> DeleteProduct(Guid id, CancellationToken cancellationToken = default)
    {
        var product = await repository.GetProductForUpdate(id, cancellationToken);
        if (product is null) return false;
        var image = await repository.GetImageForUpdate(product.ImageId, cancellationToken);
        repository.RemoveProduct(product);
        if (image is not null) repository.RemoveImage(image);
        await repository.SaveChanges(cancellationToken);
        return true;
    }

    private async Task ReplaceImage(Guid oldImageId, Action<Guid> assignImageId, string fileName,
        string contentType, byte[] data, string altText, CancellationToken cancellationToken)
    {
        var oldImage = await repository.GetImageForUpdate(oldImageId, cancellationToken);
        var newImage = CreateImage(fileName, contentType, data, altText);
        repository.AddImage(newImage);
        assignImageId(newImage.Id);
        if (oldImage is not null) repository.RemoveImage(oldImage);
    }

    private static ImageEntity CreateImage(string fileName, string contentType, byte[] data, string altText)
        => new()
        {
            Id = Guid.NewGuid(), FileName = fileName, ContentType = contentType, Data = data,
            AltText = altText.Trim(), CreatedAt = DateTimeOffset.UtcNow
        };
}
