namespace Api.Contracts;

public sealed record EventDto(
    Guid Id,
    string Name,
    string? Description,
    Guid? LogoImageId,
    Guid OwnerId,
    DateTimeOffset CreatedAt,
    bool IsArchived);

public sealed record CreateEventRequest(
    string Name,
    string? Description,
    Guid? LogoImageId);

public sealed record EventDetailDto(
    Guid Id,
    string Name,
    string? Description,
    Guid? LogoImageId,
    Guid OwnerId,
    DateTimeOffset CreatedAt,
    UserProfileDto CurrentUserProfile);

public sealed record UserProfileDto(
    Guid UserId,
    string DisplayName,
    string RoleName,
    Guid GroupId,
    List<string> Permissions);
