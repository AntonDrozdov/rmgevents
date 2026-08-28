using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed class EventService(
    IEventRepository eventRepository,
    IGroupRepository groupRepository) : IEventService
{
    public async Task<Application.Entities.Event> CreateEventAsync(
        long ownerId,
        string name,
        string? description,
        long? logoImageId = null)
    {
        var @event = new Application.Entities.Event
        {
            Id = 0,
            Name = name,
            Description = description,
            LogoImageId = logoImageId,
            OwnerId = ownerId,
            CreatedAt = DateTimeOffset.UtcNow,
            IsArchived = false
        };
        
        await eventRepository.AddAsync(@event);
        await eventRepository.SaveChangesAsync();
        
        // Create root group for the event
        await CreateRootGroupAsync(@event.Id, "Default Group", 1000);
        
        return @event;
    }
    
    public async Task<Application.Entities.Event?> GetEventAsync(long eventId)
    {
        return await eventRepository.GetByIdAsync(eventId);
    }
    
    public async Task<List<Application.Entities.Event>> GetEventsByUserAsync(long userId)
    {
        return await eventRepository.GetByUserAsync(userId);
    }
    
    public async Task<List<Application.Entities.Event>> GetEventsByOwnerAsync(long ownerId)
    {
        return await eventRepository.GetByOwnerIdAsync(ownerId);
    }
    
    public async Task UpdateEventAsync(long eventId, string name, string? description)
    {
        var @event = await eventRepository.GetByIdAsync(eventId);
        if (@event == null)
            throw new InvalidOperationException($"Event {eventId} not found");
        
        @event.Name = name;
        @event.Description = description;
        
        await eventRepository.UpdateAsync(@event);
        await eventRepository.SaveChangesAsync();
    }
    
    public async Task DeleteEventAsync(long eventId)
    {
        await eventRepository.DeleteAsync(eventId);
        await eventRepository.SaveChangesAsync();
    }
    
    public async Task<Application.Entities.Group> CreateRootGroupAsync(long eventId, string name, int quota)
    {
        var rootGroup = new Application.Entities.Group
        {
            Id = 0,
            EventId = eventId,
            ParentGroupId = null,
            Name = name,
            Quota = quota,
            CreatedAt = DateTimeOffset.UtcNow
        };
        
        await groupRepository.AddAsync(rootGroup);
        await groupRepository.SaveChangesAsync();
        
        return rootGroup;
    }
}
