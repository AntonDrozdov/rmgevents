using Application.Repositories;
using Application.Services;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Services;

public sealed class EventService(
    IEventRepository eventRepository,
    IGroupRepository groupRepository,
    IRoleRepository roleRepository,
    IUserRepository userRepository,
    IRoleService roleService,
    IImageRepository imageRepository,
    ApplicationDbContext db) : IEventService
{
    public async Task<Application.Entities.Event> CreateEventAsync(
        long creatorLoginId,
        string name,
        DateOnly eventDate,
        long? logoImageId = null)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new InvalidOperationException("Название мероприятия обязательно.");

        if (eventDate == default)
            throw new InvalidOperationException("Дата мероприятия обязательна.");

        var creatorProfile = (await userRepository.GetByLoginIdAsync(creatorLoginId))
            .OrderByDescending(user => user.CreatedAt)
            .FirstOrDefault()
            ?? throw new InvalidOperationException("Профиль создателя не найден.");

        var executionStrategy = db.Database.CreateExecutionStrategy();

        return await executionStrategy.ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync();

            var @event = new Application.Entities.Event
            {
                Id = 0,
                Name = name.Trim(),
                Description = null,
                EventDate = eventDate,
                LogoImageId = logoImageId,
                OwnerId = creatorProfile.Id,
                CreatedAt = DateTimeOffset.UtcNow,
                IsArchived = false
            };

            await eventRepository.AddAsync(@event);
            await eventRepository.SaveChangesAsync();

            var rootGroup = await CreateRootGroupAsync(@event.Id, "РМГ", 500);
            await roleService.SeedDefaultRolesAsync(@event.Id);

            var administratorRole = await roleRepository.GetByEventAndNameAsync(@event.Id, "Administrator")
                ?? throw new InvalidOperationException("Роль Administrator не создана.");

            var administrator = new Application.Entities.User
            {
                Id = 0,
                LoginId = creatorProfile.LoginId,
                EventId = @event.Id,
                RoleId = administratorRole.Id,
                GroupId = rootGroup.Id,
                Name = creatorProfile.Name,
                Surname = creatorProfile.Surname,
                AdditionalName = creatorProfile.AdditionalName,
                Email = creatorProfile.Email,
                Tel = creatorProfile.Tel,
                Meta = creatorProfile.Meta,
                CreatedAt = DateTimeOffset.UtcNow
            };

            await userRepository.AddAsync(administrator);
            await userRepository.SaveChangesAsync();

            @event.OwnerId = administrator.Id;
            @event.Owner = administrator;
            await eventRepository.UpdateAsync(@event);
            await eventRepository.SaveChangesAsync();

            await transaction.CommitAsync();
            return @event;
        });
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
    
    public async Task<Application.Entities.Event> UpdateEventAsync(
        long eventId,
        string name,
        string? description,
        DateOnly eventDate,
        long? logoImageId)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new InvalidOperationException("Название мероприятия обязательно.");

        if (name.Trim().Length > 255)
            throw new InvalidOperationException("Название не должно превышать 255 символов.");

        if (description?.Trim().Length > 2000)
            throw new InvalidOperationException("Описание не должно превышать 2000 символов.");

        if (eventDate == default)
            throw new InvalidOperationException("Дата мероприятия обязательна.");

        var @event = await eventRepository.GetByIdAsync(eventId);
        if (@event == null)
            throw new InvalidOperationException("Мероприятие не найдено.");

        if (logoImageId.HasValue && await imageRepository.GetImage(logoImageId.Value) == null)
            throw new InvalidOperationException("Выбранная обложка не найдена.");
        
        @event.Name = name.Trim();
        @event.Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        @event.EventDate = eventDate;
        @event.LogoImageId = logoImageId;
        
        await eventRepository.UpdateAsync(@event);
        await eventRepository.SaveChangesAsync();
        return @event;
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
