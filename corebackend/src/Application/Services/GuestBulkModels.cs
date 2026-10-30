using Application.Repositories;

namespace Application.Services;

public sealed record GuestBulkActionOption(string Action, string Label, int EligibleCount);
public sealed record GuestBulkSummary(int SelectedCount, IReadOnlyCollection<GuestBulkActionOption> Actions);
public sealed record GuestBulkSkipReason(string Reason, int Count);
public sealed record GuestBulkActionResult(int SelectedCount, int ChangedCount, int SkippedCount, IReadOnlyCollection<GuestBulkSkipReason> Reasons);
