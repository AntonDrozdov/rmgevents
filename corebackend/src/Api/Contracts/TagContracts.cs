using System.ComponentModel.DataAnnotations;

namespace Api.Contracts;

public sealed record TagDto(
    long Id,
    long EventId,
    string Name,
    string Color,
    DateTimeOffset CreatedAt);

public sealed record GuestTagDto(
    long Id,
    string Name,
    string Color);

public sealed record CreateTagRequest(
    [Required, StringLength(50)] string Name,
    string Color = "#FFFFFF");

public sealed record UpdateTagRequest(
    [Required, StringLength(50)] string Name,
    string Color = "#FFFFFF");
