namespace Api.Contracts;

public sealed record EventDto(
    long Id,
    string Name,
    string? Description,
    long? LogoImageId,
    long OwnerId,
    DateTimeOffset CreatedAt,
    bool IsArchived);

public sealed record CreateEventRequest(
    string Name,
    string? Description,
    long? LogoImageId);

public sealed record EventDetailDto(
    long Id,
    string Name,
    string? Description,
    long? LogoImageId,
    long OwnerId,
    DateTimeOffset CreatedAt,
    UserProfileDto CurrentUserProfile);

public sealed record UserProfileDto(
    long UserId,
    string Name,
    string Surname,
    string? AdditionalName,
    string? Email,
    string? Tel,
    string RoleName,
    long GroupId,
    List<string> Permissions);
