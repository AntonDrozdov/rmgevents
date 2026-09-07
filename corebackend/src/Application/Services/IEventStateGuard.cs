namespace Application.Services;

public interface IEventStateGuard
{
    Task EnsureActiveAsync(long eventId);
}
