namespace Application.Services;

public interface IEventService
{
    Task<Entities.Event> CreateEventAsync(Guid ownerId, string name, string? description);
    Task<Entities.Event?> GetEventAsync(Guid eventId);
    Task<List<Entities.Event>> GetEventsByUserAsync(Guid userId);
    Task<List<Entities.Event>> GetEventsByOwnerAsync(Guid ownerId);
    Task UpdateEventAsync(Guid eventId, string name, string? description);
    Task DeleteEventAsync(Guid eventId);
    Task<Entities.Group> CreateRootGroupAsync(Guid eventId, string name, int quota);
}
