using Application.Entities;
using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed class ImageService(IImageRepository repository) : IImageService
{
    public Task<ImageEntity?> GetImage(Guid id, CancellationToken cancellationToken = default)
        => repository.GetImage(id, cancellationToken);
}
