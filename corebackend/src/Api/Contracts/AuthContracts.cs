namespace Api.Contracts;

public sealed record LoginRequest(string Login, string Password);
public sealed record RegisterRequest(string Login, string Password);
public sealed record LoginResponse(string Sid, List<EventOption> Events);
public sealed record EventOption(long Id, string Name, string RoleName);
