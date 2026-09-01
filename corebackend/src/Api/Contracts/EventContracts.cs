namespace Api.Contracts;

public sealed record EventDto(
    long Id,
    string Name,
    string? Description,
    DateOnly EventDate,
    string CreatedByName,
    long? LogoImageId,
    long OwnerId,
    DateTimeOffset CreatedAt,
    bool IsArchived);

public sealed record CreateEventRequest(
    string Name,
    DateOnly EventDate,
    long? LogoImageId);

public sealed record UpdateEventRequest(
    string Name,
    string? Description,
    DateOnly EventDate,
    long? LogoImageId);

public sealed record ImageUploadResponse(long Id);

public sealed record EventDetailDto(
    long Id,
    string Name,
    string? Description,
    DateOnly EventDate,
    string CreatedByName,
    long? LogoImageId,
    long OwnerId,
    DateTimeOffset CreatedAt,
    UserProfileDto CurrentUserProfile);

public sealed record UserProfileDto(
    long UserId,
    string Login,
    string Name,
    string Surname,
    string? AdditionalName,
    string? Email,
    string? Tel,
    string RoleName,
    long GroupId,
    List<string> Permissions);
