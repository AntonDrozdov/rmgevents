using Application.Entities;

namespace Application.Services;

public interface IImageService
{
    Task<ImageEntity?> GetImage(Guid id, CancellationToken cancellationToken = default);
}
