namespace Api.Contracts;

public sealed record LoginRequest(string Login, string Password);
public sealed record RegisterRequest(string Login, string Password);
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public sealed record ChangePasswordResponse(string Sid);
public sealed record LoginResponse(string Sid, List<EventOption> Events, bool MustChangePassword);
public sealed record EventOption(
    long Id,
    string Name,
    string RoleName,
    DateOnly EventDate,
    DateTimeOffset CreatedAt,
    string CreatedByName,
    long? LogoImageId);
