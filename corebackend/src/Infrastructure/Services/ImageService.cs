using Application.Entities;
using Application.Repositories;
using Application.Services;
using System.Text;
using System.Xml.Linq;

namespace Infrastructure.Services;

public sealed class ImageService(IImageRepository repository) : IImageService
{
    private const int MaximumCoverSize = 5 * 1024 * 1024;

    public Task<ImageEntity?> GetImage(long id, CancellationToken cancellationToken = default)
        => repository.GetImage(id, cancellationToken);

    public async Task<ImageEntity> SaveEventCover(
        string fileName,
        string contentType,
        byte[] data,
        CancellationToken cancellationToken = default)
    {
        if (data.Length == 0)
            throw new InvalidOperationException("Файл обложки пуст.");

        if (data.Length > MaximumCoverSize)
            throw new InvalidOperationException("Размер обложки не должен превышать 5 МБ.");

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        var normalizedContentType = extension switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".svg" => "image/svg+xml",
            _ => throw new InvalidOperationException("Допустимы только файлы JPG, JPEG, PNG и SVG.")
        };

        if (normalizedContentType == "image/jpeg" && !IsJpeg(data))
            throw new InvalidOperationException("Содержимое файла не соответствует формату JPEG.");

        if (normalizedContentType == "image/png" && !IsPng(data))
            throw new InvalidOperationException("Содержимое файла не соответствует формату PNG.");

        if (normalizedContentType == "image/svg+xml")
            ValidateSvg(data);

        if (!string.IsNullOrWhiteSpace(contentType)
            && !string.Equals(contentType, normalizedContentType, StringComparison.OrdinalIgnoreCase)
            && !(normalizedContentType == "image/jpeg" && string.Equals(contentType, "image/jpg", StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidOperationException("Тип файла не соответствует его расширению.");
        }

        return await repository.AddImage(new ImageEntity
        {
            FileName = Path.GetFileName(fileName),
            ContentType = normalizedContentType,
            Data = data,
            AltText = "Обложка мероприятия",
            CreatedAt = DateTimeOffset.UtcNow
        }, cancellationToken);
    }

    private static bool IsJpeg(byte[] data) =>
        data.Length >= 3 && data[0] == 0xff && data[1] == 0xd8 && data[2] == 0xff;

    private static bool IsPng(byte[] data) =>
        data.Length >= 8
        && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4e && data[3] == 0x47
        && data[4] == 0x0d && data[5] == 0x0a && data[6] == 0x1a && data[7] == 0x0a;

    private static void ValidateSvg(byte[] data)
    {
        try
        {
            var svg = XDocument.Parse(Encoding.UTF8.GetString(data), LoadOptions.None);
            var root = svg.Root ?? throw new InvalidOperationException("Файл не является SVG-изображением.");
            if (!string.Equals(root.Name.LocalName, "svg", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Файл не является SVG-изображением.");

            var forbiddenElements = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "script", "foreignObject", "iframe", "object", "embed"
            };

            foreach (var element in root.DescendantsAndSelf())
            {
                if (forbiddenElements.Contains(element.Name.LocalName))
                    throw new InvalidOperationException("SVG содержит небезопасные элементы.");

                foreach (var attribute in element.Attributes())
                {
                    var name = attribute.Name.LocalName;
                    var value = attribute.Value.Trim();
                    if (name.StartsWith("on", StringComparison.OrdinalIgnoreCase)
                        || value.StartsWith("javascript:", StringComparison.OrdinalIgnoreCase)
                        || ((name.Equals("href", StringComparison.OrdinalIgnoreCase)
                             || name.Equals("src", StringComparison.OrdinalIgnoreCase))
                            && (value.StartsWith("http:", StringComparison.OrdinalIgnoreCase)
                                || value.StartsWith("https:", StringComparison.OrdinalIgnoreCase)
                                || value.StartsWith("//", StringComparison.OrdinalIgnoreCase))))
                    {
                        throw new InvalidOperationException("SVG содержит небезопасные ссылки или обработчики.");
                    }
                }
            }
        }
        catch (InvalidOperationException)
        {
            throw;
        }
        catch
        {
            throw new InvalidOperationException("Не удалось прочитать SVG-изображение.");
        }
    }
}
