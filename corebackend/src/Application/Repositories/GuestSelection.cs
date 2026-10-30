namespace Application.Repositories;

public sealed record GuestSelection(
    bool SelectAllMatching,
    IReadOnlyCollection<long> GuestIds,
    IReadOnlyCollection<long> ExcludedGuestIds,
    string? Search,
    IReadOnlyCollection<string> Statuses,
    bool IncludeDeleted,
    IReadOnlyCollection<long> CategoryIds,
    IReadOnlyCollection<long> TagIds,
    IReadOnlyCollection<long> GroupIds,
    IReadOnlyCollection<long> CreatedByUserIds);
