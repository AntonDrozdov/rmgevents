namespace Application.Services;

public interface ITagService
{
    Task<List<Entities.Tag>> GetTagsByEventAsync(long eventId, long loginId);
    Task<Entities.Tag> CreateTagAsync(long eventId, long loginId, string name, string color);
    Task<Entities.Tag> UpdateTagAsync(long eventId, long tagId, long loginId, string name, string color);
    Task DeleteTagAsync(long eventId, long tagId, long loginId);
}
