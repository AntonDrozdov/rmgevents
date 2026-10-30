namespace WebApi;

public static class AssistantReadIntent
{
    private static readonly string[] ReadMarkers =
    [
        "сколько", "какой", "какая", "какие", "покажи", "перечисли", "свобод",
        "доступн", "занят", "информац", "данн", "есть ли", "где", "кто"
    ];

    private static readonly string[] WriteMarkers =
    [
        "созда", "добав", "измени", "удали", "перемести", "назнач", "рассади",
        "сделай", "переимен", "обнови"
    ];

    public static string? Select(IReadOnlyList<AssistantMessage> messages, bool eventSelected)
    {
        if (!eventSelected) return null;
        var current = messages.LastOrDefault(x => x.Role == "user")?.Content.Trim().ToLowerInvariant() ?? "";
        if (current.Length == 0 || WriteMarkers.Any(current.Contains) || !ReadMarkers.Any(current.Contains)) return null;

        // A short follow-up such as "сколько их?" inherits only the subject previously named by the user.
        var subject = string.Join(' ', messages.Where(x => x.Role == "user").TakeLast(3).Select(x => x.Content.ToLowerInvariant()));
        if (ContainsAny(subject, "рассад", "размещ", "мест", "стол", "ряд", "посадк")) return "get_placements";
        if (ContainsAny(subject, "групп", "квот")) return "get_groups";
        if (ContainsAny(subject, "гост", "участник", "приглаш")) return "get_event_summary";
        return null;
    }

    private static bool ContainsAny(string value, params string[] markers) => markers.Any(value.Contains);
}
