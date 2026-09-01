namespace Application.Services;

public interface IEventService
{
    Task<Entities.Event> CreateEventAsync(long creatorLoginId, string name, DateOnly eventDate, long? logoImageId = null);
    Task<Entities.Event?> GetEventAsync(long eventId);
    Task<List<Entities.Event>> GetEventsByUserAsync(long userId);
    Task<List<Entities.Event>> GetEventsByOwnerAsync(long ownerId);
    Task<Entities.Event> UpdateEventAsync(
        long eventId,
        string name,
        string? description,
        DateOnly eventDate,
        long? logoImageId);
    Task DeleteEventAsync(long eventId);
    Task<Entities.Group> CreateRootGroupAsync(long eventId, string name, int quota);
}
