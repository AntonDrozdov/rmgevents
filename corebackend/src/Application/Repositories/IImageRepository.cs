using Application.Entities;

namespace Application.Repositories;

public interface IImageRepository
{
    Task<ImageEntity?> GetImage(long id, CancellationToken cancellationToken = default);
}
