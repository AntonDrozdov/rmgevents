using Application.Entities;

namespace Application.Services;

public interface IImageService
{
    Task<ImageEntity?> GetImage(long id, CancellationToken cancellationToken = default);
    Task<ImageEntity> SaveEventCover(
        string fileName,
        string contentType,
        byte[] data,
        CancellationToken cancellationToken = default);
}
