namespace Api.Contracts;

public sealed record LoginRequest(string Username, string Password);
public sealed record LoginResponse(string Token, List<EventOption> Events);
public sealed record EventOption(Guid Id, string Name, string RoleName);
