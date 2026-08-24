using Application.Entities;
using Application.Repositories;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public sealed class ImageRepository(ApplicationDbContext dbContext) : IImageRepository
{
    public Task<ImageEntity?> GetImage(Guid id, CancellationToken cancellationToken = default)
        => dbContext.Images
            .AsNoTracking()
            .SingleOrDefaultAsync(image => image.Id == id, cancellationToken);
}
