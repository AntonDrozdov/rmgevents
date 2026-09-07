using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed class EventStateGuard(IEventRepository eventRepository) : IEventStateGuard
{
    public async Task EnsureActiveAsync(long eventId)
    {
        var @event = await eventRepository.GetByIdAsync(eventId);
        if (@event == null)
            throw new InvalidOperationException("Мероприятие не найдено.");

        if (@event.IsArchived)
        {
            throw new InvalidOperationException(
                "Мероприятие завершено. Чтобы вносить изменения, верните его в активные.");
        }
    }
}
