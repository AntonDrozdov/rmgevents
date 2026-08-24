using Application.Entities;

namespace Application.Repositories;

public interface IImageRepository
{
    Task<ImageEntity?> GetImage(Guid id, CancellationToken cancellationToken = default);
}
