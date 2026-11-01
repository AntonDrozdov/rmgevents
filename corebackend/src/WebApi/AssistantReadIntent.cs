using System.Text.Json;

namespace WebApi;

public sealed record AssistantRequiredTool(string Name, JsonElement Arguments);

public static class AssistantReadIntent
{
    private static readonly string[] ReadMarkers =
    [
        "сколько", "какой", "какая", "какие", "покажи", "перечисли", "вывед", "список", "свобод", "статистик",
        "доступн", "занят", "информац", "данн", "есть ли", "где", "кто"
    ];

    private static readonly string[] WriteMarkers =
    [
        "созда", "добав", "измени", "удали", "перемести", "назнач", "рассади", "пересад",
        "сделай", "переимен", "обнови", "посади"
    ];

    public static AssistantRequiredTool? Select(IReadOnlyList<AssistantMessage> messages, bool eventSelected)
    {
        var current = messages.LastOrDefault(x => x.Role == "user")?.Content.Trim() ?? "";
        var normalized = current.ToLowerInvariant();
        if (normalized.Length == 0) return null;

        if (ContainsAny(normalized, "в каких мероприят", "на каких мероприят", "по всем мероприят", "во всех мероприят", "в каких событиях", "на каких событиях"))
        {
            if (ContainsAny(normalized, "гост", "участник", "приглаш") && ExtractCrossGuestQuery(current, normalized) is { } crossGuestQuery)
                return Tool("search_guests_across_events", new { query = crossGuestQuery });
            if (ContainsAny(normalized, "сотруд", "работник") && ExtractCrossStaffQuery(current, normalized) is { } crossStaffQuery)
                return Tool("search_staff_across_events", new { query = crossStaffQuery });
        }

        if (!eventSelected) return null;

        var neighborQuery = ExtractNeighborQuery(current, normalized);
        if (neighborQuery is not null)
            return Tool("get_guest_neighbors", new { query = neighborQuery });

        if (ContainsAny(normalized, "гост", "участник", "приглаш") && ExtractGuestSearchQuery(current, normalized) is { } guestQuery)
            return Tool("search_guests", new { query = guestQuery });

        if (ContainsAny(normalized, "сотруд", "работник") && ExtractStaffSearchQuery(current, normalized) is { } staffQuery)
            return Tool("search_staff", new { query = staffQuery });

        if (WriteMarkers.Any(normalized.Contains) || !ReadMarkers.Any(normalized.Contains)) return null;

        // A short follow-up such as "сколько их?" inherits only the subject previously named by the user.
        var subject = string.Join(' ', messages.Where(x => x.Role == "user").TakeLast(3).Select(x => x.Content.ToLowerInvariant()));
        if (ContainsAny(subject, "рассад", "размещ", "мест", "стол", "ряд", "посадк")) return Tool("get_placements");
        if (ContainsAny(subject, "групп", "квот")) return Tool("get_groups");
        if (ContainsAny(subject, "сотруд", "работник"))
        {
            if (ContainsAny(normalized, "покажи", "перечисли", "вывед", "список")) return Tool("list_staff");
            return Tool("get_staff_summary");
        }
        if (ContainsAny(subject, "гост", "участник", "приглаш"))
        {
            if (ContainsAny(normalized, "покажи", "перечисли", "вывед", "по имен", "кто приглаш")) return Tool("list_guests");
            return Tool("get_event_summary");
        }
        return null;
    }

    private static string? ExtractNeighborQuery(string original, string normalized)
    {
        var marker = normalized.LastIndexOf("рядом с ", StringComparison.Ordinal);
        if (marker >= 0) return CleanQuery(original[(marker + "рядом с ".Length)..]);

        foreach (var prefix in new[] { "с кем рядом сидит ", "кто сидит рядом с ", "кто рядом с " })
        {
            var index = normalized.IndexOf(prefix, StringComparison.Ordinal);
            if (index >= 0) return CleanQuery(original[(index + prefix.Length)..]);
        }
        return null;
    }

    private static string? ExtractGuestSearchQuery(string original, string normalized)
    {
        foreach (var marker in new[] {
            "есть ли гость ", "есть ли гостя ", "есть ли участник ", "есть ли участника ",
            "найди гостя ", "найди участника ", "проверь гостя ", "проверь участника ",
            "приглашён ли ", "приглашен ли " })
        {
            var index = normalized.IndexOf(marker, StringComparison.Ordinal);
            if (index >= 0) return CleanQuery(original[(index + marker.Length)..]);
        }
        return null;
    }

    private static string? ExtractCrossGuestQuery(string original, string normalized) =>
        ExtractQueryAfterAny(original, normalized,
            "в каких мероприятиях участвовал гость ", "в каких мероприятиях был гость ",
            "на каких мероприятиях был гость ", "в каких событиях был гость ",
            "в каких мероприятиях участвовала гостья ", "в каких мероприятиях была гостья ");

    private static string? ExtractCrossStaffQuery(string original, string normalized) =>
        ExtractQueryAfterAny(original, normalized,
            "в каких мероприятиях был сотрудник ", "в каких мероприятиях работал сотрудник ",
            "на каких мероприятиях был сотрудник ", "в каких событиях был сотрудник ",
            "в каких мероприятиях была сотрудница ", "в каких мероприятиях работала сотрудница ");

    private static string? ExtractStaffSearchQuery(string original, string normalized) =>
        ExtractQueryAfterAny(original, normalized,
            "найди сотрудника ", "найди сотрудницу ", "найди работника ",
            "проверь сотрудника ", "есть ли сотрудник ", "есть ли сотрудница ");

    private static string? ExtractQueryAfterAny(string original, string normalized, params string[] markers)
    {
        foreach (var marker in markers)
        {
            var index = normalized.IndexOf(marker, StringComparison.Ordinal);
            if (index >= 0) return CleanQuery(original[(index + marker.Length)..]);
        }
        return null;
    }

    private static string? CleanQuery(string value)
    {
        var result = value.Trim().Trim('?', '!', '.', ',', ':', ';', '«', '»', '"', '\'');
        foreach (var suffix in new[] { " в этом мероприятии", " в мероприятии", " среди гостей" })
            if (result.EndsWith(suffix, StringComparison.OrdinalIgnoreCase)) result = result[..^suffix.Length].Trim();
        return result.Length is >= 2 and <= 100 ? result : null;
    }

    private static AssistantRequiredTool Tool(string name, object? arguments = null) =>
        new(name, JsonSerializer.SerializeToElement(arguments ?? new { }));

    private static bool ContainsAny(string value, params string[] markers) => markers.Any(value.Contains);
}
