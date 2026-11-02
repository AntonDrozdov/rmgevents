using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed class GuestService(
    PlacementService placements,
    IGuestRepository guestRepository,
    IGroupRepository groupRepository,
    ICategoryRepository categoryRepository,
    ITagRepository tagRepository,
    IPermissionService permissionService,
    IUserRepository userRepository,
    IEventStateGuard eventStateGuard,
    IEventLogService eventLogService) : IGuestService
{
    private static readonly HashSet<string> KnownStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "saved",
        "on_review",
        "admin_review",
        "approved",
        "invited",
        "rejected"
    };
    private static readonly HashSet<string> KnownSortFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "name",
        "status",
        "category",
        "group",
        "placement",
        "createdBy"
    };

    public Task<Application.Entities.Guest> CreateGuestAsync(long eventId, long loginId, string name, string? email, string? phone, long groupId, long? categoryId, IReadOnlyCollection<long> tagIds, long? placementId = null, int? placementSeatNumber = null, long? parentGuestId = null)
        => placements.Transaction(eventId, () => CreateGuestCoreAsync(eventId, loginId, name, email, phone, groupId, categoryId, tagIds, placementId, placementSeatNumber, parentGuestId));

    public Task<(Application.Entities.Guest Guest, List<Application.Entities.Guest> Companions)> CreateGuestWithCompanionsAsync(
        long eventId,
        long loginId,
        string name,
        string? email,
        string? phone,
        long groupId,
        long? categoryId,
        IReadOnlyCollection<long> tagIds,
        IReadOnlyCollection<(string Name, long GroupId, long? CategoryId)> companions,
        long? placementId = null,
        int? placementSeatNumber = null)
    {
        if (companions.Count is < 1 or > 50)
            throw new InvalidOperationException("A guest can have from 1 to 50 companions");

        return placements.Transaction(eventId, async () =>
        {
            var guest = await CreateGuestCoreAsync(eventId, loginId, name, email, phone, groupId, categoryId, tagIds,
                placementId, placementSeatNumber);
            var createdCompanions = new List<Application.Entities.Guest>(companions.Count);

            foreach (var companion in companions)
            {
                if (string.IsNullOrWhiteSpace(companion.Name))
                    throw new InvalidOperationException("Companion name is required");
                if (!companion.CategoryId.HasValue)
                    throw new InvalidOperationException("Guest category is required");

                createdCompanions.Add(await CreateGuestCoreAsync(eventId, loginId, companion.Name.Trim(), null, null,
                    companion.GroupId, companion.CategoryId, [], null, null, guest.Id));
            }

            return (guest, createdCompanions);
        });
    }

    private async Task<Application.Entities.Guest> CreateGuestCoreAsync(
        long eventId,
        long loginId,
        string name,
        string? email,
        string? phone,
        long groupId,
        long? categoryId,
        IReadOnlyCollection<long> tagIds, long? placementId = null, int? placementSeatNumber = null, long? parentGuestId = null)
    {
        await eventStateGuard.EnsureActiveAsync(eventId);

        // Проверяем разрешение
        if (!await permissionService.HasPermissionAsync(loginId, eventId, "create_guest"))
            throw new UnauthorizedAccessException("No permission to create guests");
        
        var actor = await GetActorAsync(loginId, eventId);

        if (parentGuestId.HasValue)
        {
            var parent = await guestRepository.GetByIdAsync(parentGuestId.Value)
                ?? throw new InvalidOperationException("Parent guest not found");
            if (parent.EventId != eventId || parent.ParentGuestId.HasValue)
                throw new InvalidOperationException("Invalid parent guest");
        }
        
        // Получаем группу пользователя
        var userGroupId = actor.GroupId;
        
        // Проверяем иерархию групп
        if (!await permissionService.CanCreateGuestInGroupAsync(loginId, eventId, groupId, userGroupId))
            throw new UnauthorizedAccessException("Cannot create guest in this group");
        
        // Проверяем квоту
        var availableQuota = await GetAvailableQuotaInGroupAsync(groupId);
        if (availableQuota <= 0)
            throw new InvalidOperationException("Group quota is full");

        await EnsureCategoryBelongsToEventAsync(eventId, categoryId);
        var normalizedTagIds = await EnsureTagsBelongToEventAsync(eventId, tagIds);
        
        var resolvedSeatNumber = await placements.ResolveSeat(eventId, groupId, placementId, requestedSeatNumber: placementSeatNumber);
        var guest = new Application.Entities.Guest
        {
            Id = 0,
            EventId = eventId,
            GroupId = groupId,
            ParentGuestId = parentGuestId,
            CreatedByUserId = actor.Id,
            PlacementId = placementId,
            PlacementSeatNumber = resolvedSeatNumber,
            Name = name,
            Email = email,
            Phone = phone,
            Status = "saved",
            CreatedAt = DateTimeOffset.UtcNow
        };
        
        await guestRepository.AddAsync(guest);
        await guestRepository.SaveChangesAsync();

        if (categoryId.HasValue)
        {
            await guestRepository.SetGuestCategoryAsync(guest.Id, categoryId);
        }

        await guestRepository.SetGuestTagsAsync(guest.Id, normalizedTagIds);
        await guestRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            eventId,
            loginId,
            "created",
            "Guest",
            guest.Id,
            "Создан гость",
            BuildGuestDescription(name, email, phone));
        
        return await guestRepository.GetByIdAsync(guest.Id) ?? guest;
    }
    
    public async Task<Application.Entities.Guest?> GetGuestAsync(long guestId, bool includeDeleted = false)
    {
        return await guestRepository.GetByIdAsync(guestId, includeDeleted);
    }

    public Task<Application.Entities.Guest?> GetGuestByPublicIdAsync(Guid publicId) => guestRepository.GetByPublicIdAsync(publicId);
    
    public async Task<List<Application.Entities.Guest>> GetGuestsByEventAsync(long eventId)
    {
        return await guestRepository.GetByEventIdAsync(eventId);
    }

    public async Task<List<Application.Entities.Guest>> GetCompanionsAsync(long parentGuestId, long loginId)
    {
        var parent = await guestRepository.GetByIdAsync(parentGuestId)
            ?? throw new InvalidOperationException("Guest not found");
        await EnsureCanManageGuestAsync(parent, loginId);
        return await guestRepository.GetCompanionsByParentIdAsync(parentGuestId);
    }

    public async Task<List<Application.Entities.Guest>> SaveCompanionsAsync(long parentGuestId, long loginId,
        IReadOnlyCollection<(long? Id, string Name, long GroupId, long? CategoryId)> companions)
    {
        var parent = await guestRepository.GetByIdAsync(parentGuestId)
            ?? throw new InvalidOperationException("Guest not found");
        if (parent.ParentGuestId.HasValue)
            throw new InvalidOperationException("A companion cannot have companions");
        if (companions.Count > 50)
            throw new InvalidOperationException("A guest can have at most 50 companions at once");
        if (companions.Where(x => x.Id.HasValue).GroupBy(x => x.Id).Any(x => x.Count() > 1))
            throw new InvalidOperationException("The companion list contains duplicate guests");

        return await placements.Transaction(parent.EventId, async () =>
        {
            await eventStateGuard.EnsureActiveAsync(parent.EventId);
            await EnsureCanManageGuestAsync(parent, loginId);
            var existingCompanions = await guestRepository.GetCompanionsByParentIdAsync(parentGuestId);
            var requestedIds = companions.Where(companion => companion.Id.HasValue)
                .Select(companion => companion.Id!.Value)
                .ToHashSet();

            if (requestedIds.Any(id => existingCompanions.All(companion => companion.Id != id)))
                throw new InvalidOperationException("Companion does not belong to this guest");

            foreach (var removedCompanion in existingCompanions.Where(companion => !requestedIds.Contains(companion.Id)))
            {
                await DeleteGuestAsync(removedCompanion.Id, loginId);
            }

            var saved = new List<Application.Entities.Guest>();
            foreach (var companion in companions)
            {
                if (string.IsNullOrWhiteSpace(companion.Name))
                    throw new InvalidOperationException("Companion name is required");
                if (!companion.CategoryId.HasValue)
                    throw new InvalidOperationException("Guest category is required");

                if (companion.Id.HasValue)
                {
                    var existing = existingCompanions.First(existingCompanion => existingCompanion.Id == companion.Id!.Value);
                    await UpdateGuestCoreAsync(existing.Id, loginId, companion.Name.Trim(), existing.Email, existing.Phone,
                        companion.GroupId, companion.CategoryId, existing.GuestTags.Select(x => x.TagId).ToArray(),
                        existing.PlacementId, existing.PlacementSeatNumber);
                    saved.Add(await guestRepository.GetByIdAsync(existing.Id) ?? existing);
                }
                else
                {
                    saved.Add(await CreateGuestCoreAsync(parent.EventId, loginId, companion.Name.Trim(), null, null,
                        companion.GroupId, companion.CategoryId, [], null, null, parentGuestId));
                }
            }
            return saved;
        });
    }

    public async Task<(List<Application.Entities.Guest> Items, int TotalCount, int Page, int PageSize)> GetGuestsPageByEventAsync(
        long eventId,
        int page,
        int pageSize,
        string? search,
        IReadOnlyCollection<string>? statuses = null,
        bool eligibleForSeating = false,
        IReadOnlyCollection<long>? categoryIds = null,
        IReadOnlyCollection<long>? tagIds = null,
        IReadOnlyCollection<long>? groupIds = null,
        IReadOnlyCollection<long>? createdByUserIds = null,
        bool hasCompanions = false,
        bool includeDeleted = false,
        string? sortBy = null,
        string? sortDirection = null)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var normalizedSearch = search?.Trim();
        if (normalizedSearch is not { Length: >= 2 })
            normalizedSearch = null;

        var normalizedStatuses = statuses?
            .Select(status => status.Trim().ToLowerInvariant())
            .Where(status => KnownStatuses.Contains(status))
            .Distinct()
            .ToList() ?? [];

        var normalizedCategoryIds = categoryIds?
            .Where(id => id > 0)
            .Distinct()
            .ToList() ?? [];

        var normalizedTagIds = tagIds?
            .Where(id => id > 0)
            .Distinct()
            .ToList() ?? [];

        var normalizedGroupIds = groupIds?
            .Where(id => id > 0)
            .Distinct()
            .ToList() ?? [];

        var normalizedCreatedByUserIds = createdByUserIds?
            .Where(id => id > 0)
            .Distinct()
            .ToList() ?? [];

        var normalizedSortBy = sortBy?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedSortBy) || !KnownSortFields.Contains(normalizedSortBy))
            normalizedSortBy = null;
        var sortDescending = normalizedSortBy != null
            && string.Equals(sortDirection?.Trim(), "desc", StringComparison.OrdinalIgnoreCase);

        var result = await guestRepository.GetPageByEventIdAsync(
            eventId,
            normalizedSearch,
            normalizedStatuses,
            eligibleForSeating,
            normalizedCategoryIds,
            normalizedTagIds,
            normalizedGroupIds,
            normalizedCreatedByUserIds,
            hasCompanions,
            includeDeleted,
            normalizedSortBy,
            sortDescending,
            page,
            pageSize);

        return (result.Items, result.TotalCount, result.Page, pageSize);
    }
    
    public async Task<List<Application.Entities.Guest>> GetGuestsByGroupAsync(long groupId)
    {
        return await guestRepository.GetByGroupIdAsync(groupId);
    }
    
    public async Task<List<Application.Entities.Guest>> GetGuestsByStatusAsync(long eventId, string status)
    {
        return await guestRepository.GetByStatusAsync(eventId, status);
    }

    public async Task<List<Application.Entities.Guest>> SearchGuestsForEventAsync(
        long eventId,
        string? name,
        string? email,
        string? phone)
    {
        static string? Normalize(string? value)
        {
            var normalized = value?.Trim();
            return normalized is { Length: >= 2 } ? normalized : null;
        }

        return await guestRepository.SearchForEventAsync(
            eventId,
            Normalize(name),
            Normalize(email),
            Normalize(phone),
            10);
    }
    
    public async Task SubmitGuestForReviewAsync(long guestId, long loginId)
    {
        var guest = await guestRepository.GetByIdAsync(guestId);
        if (guest == null)
            throw new InvalidOperationException($"Guest {guestId} not found");

        await eventStateGuard.EnsureActiveAsync(guest.EventId);

        await EnsureCanManageGuestAsync(guest, loginId);
        if (guest.Status != "saved")
            throw new InvalidOperationException("Only a saved guest can be submitted for review");

        var actor = await GetActorAsync(loginId, guest.EventId);
        guest.Decisions.Add(new Application.Entities.GuestDecision
        {
            ActorUserId = actor.Id,
            ActorName = FormatUserName(actor),
            Action = "submitted_for_review",
            CreatedAt = DateTimeOffset.UtcNow
        });
        guest.Status = "on_review";

        await guestRepository.UpdateAsync(guest);
        await guestRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            guest.EventId,
            loginId,
            "submitted_for_review",
            "Guest",
            guest.Id,
            "Гость отправлен на согласование",
            $"Гость: {guest.Name}");
    }

    public async Task ApproveGuestAsync(long guestId, long approverLoginId)
    {
        var guest = await guestRepository.GetByIdAsync(guestId);
        if (guest == null)
            throw new InvalidOperationException($"Guest {guestId} not found");

        await eventStateGuard.EnsureActiveAsync(guest.EventId);

        // Проверяем разрешение
        if (!await permissionService.HasPermissionAsync(approverLoginId, guest.EventId, "approve_guest"))
            throw new UnauthorizedAccessException("No permission to approve guests");

        await EnsureGuestIsInApproverScopeAsync(guest, approverLoginId);

        var actor = await GetActorAsync(approverLoginId, guest.EventId);
        var isAdministrator = string.Equals(
            actor.Role?.Name,
            "Administrator",
            StringComparison.OrdinalIgnoreCase);
        string action;
        string nextStatus;
        if (guest.Status == "on_review" && isAdministrator)
        {
            action = "admin_approved";
            nextStatus = "approved";
        }
        else if (guest.Status == "on_review")
        {
            action = "reviewer_approved";
            nextStatus = "admin_review";
        }
        else if (guest.Status == "admin_review" && isAdministrator)
        {
            action = "admin_approved";
            nextStatus = "approved";
        }
        else
        {
            throw new InvalidOperationException("Guest cannot be approved by this employee at the current stage");
        }

        var now = DateTimeOffset.UtcNow;
        guest.Decisions.Add(new Application.Entities.GuestDecision
        {
            ActorUserId = actor.Id,
            ActorName = FormatUserName(actor),
            Action = action,
            CreatedAt = now
        });
        guest.Status = nextStatus;
        guest.ApprovedAt = isAdministrator ? now : null;
        
        await guestRepository.UpdateAsync(guest);
        await guestRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            guest.EventId,
            approverLoginId,
            action,
            "Guest",
            guest.Id,
            isAdministrator ? "Гость согласован администратором" : "Гость согласован",
            $"Гость: {guest.Name}. Новый статус: {GetStatusLabel(nextStatus)}");
    }
    
    public async Task RejectGuestAsync(long guestId, long approverLoginId)
    {
        var guest = await guestRepository.GetByIdAsync(guestId);
        if (guest == null)
            throw new InvalidOperationException($"Guest {guestId} not found");

        await eventStateGuard.EnsureActiveAsync(guest.EventId);

        if (!await permissionService.HasPermissionAsync(approverLoginId, guest.EventId, "approve_guest"))
            throw new UnauthorizedAccessException("No permission to reject guests");

        await EnsureGuestIsInApproverScopeAsync(guest, approverLoginId);

        if (guest.Status == "saved")
            throw new InvalidOperationException("A saved guest cannot be rejected");
        if (guest.Status == "rejected")
            throw new InvalidOperationException("Guest is already rejected");

        var actor = await GetActorAsync(approverLoginId, guest.EventId);
        guest.Decisions.Add(new Application.Entities.GuestDecision
        {
            ActorUserId = actor.Id,
            ActorName = FormatUserName(actor),
            Action = "rejected",
            CreatedAt = DateTimeOffset.UtcNow
        });
        guest.Status = "rejected";
        
        await guestRepository.UpdateAsync(guest);
        await guestRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            guest.EventId,
            approverLoginId,
            "rejected",
            "Guest",
            guest.Id,
            "Гость отклонён",
            $"Гость: {guest.Name}");
    }

    public async Task InviteGuestAsync(long guestId, long inviterLoginId)
    {
        var guest = await guestRepository.GetByIdAsync(guestId);
        if (guest == null)
            throw new InvalidOperationException($"Guest {guestId} not found");

        await eventStateGuard.EnsureActiveAsync(guest.EventId);

        if (!await permissionService.HasPermissionAsync(inviterLoginId, guest.EventId, "create_guest"))
            throw new UnauthorizedAccessException("No permission to invite guests");

        await EnsureCanManageGuestAsync(guest, inviterLoginId);

        if (guest.Status != "approved")
            throw new InvalidOperationException("Only an approved guest can be invited");

        var actor = await GetActorAsync(inviterLoginId, guest.EventId);
        guest.Decisions.Add(new Application.Entities.GuestDecision
        {
            ActorUserId = actor.Id,
            ActorName = FormatUserName(actor),
            Action = "invited",
            CreatedAt = DateTimeOffset.UtcNow
        });
        guest.Status = "invited";

        await guestRepository.UpdateAsync(guest);
        await guestRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            guest.EventId,
            inviterLoginId,
            "invited",
            "Guest",
            guest.Id,
            "Гость приглашён",
            $"Гость: {guest.Name}");
    }

    public async Task RestoreGuestToSavedAsync(long guestId, long loginId)
    {
        var guest = await guestRepository.GetByIdAsync(guestId);
        if (guest == null)
            throw new InvalidOperationException($"Guest {guestId} not found");

        await eventStateGuard.EnsureActiveAsync(guest.EventId);

        if (!await permissionService.HasPermissionAsync(loginId, guest.EventId, "approve_guest"))
            throw new UnauthorizedAccessException("No permission to restore guests");

        await EnsureGuestIsInApproverScopeAsync(guest, loginId);

        if (guest.Status != "rejected")
            throw new InvalidOperationException("Only a rejected guest can be restored");

        var actor = await GetActorAsync(loginId, guest.EventId);
        guest.Decisions.Add(new Application.Entities.GuestDecision
        {
            ActorUserId = actor.Id,
            ActorName = FormatUserName(actor),
            Action = "restored_to_saved",
            CreatedAt = DateTimeOffset.UtcNow
        });
        guest.Status = "saved";
        guest.ApprovedAt = null;

        await guestRepository.UpdateAsync(guest);
        await guestRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            guest.EventId,
            loginId,
            "restored_to_saved",
            "Guest",
            guest.Id,
            "Гость возвращён в сохранённые",
            $"Гость: {guest.Name}");
    }

    private async Task EnsureGuestIsInApproverScopeAsync(Application.Entities.Guest guest, long approverLoginId)
    {
        var approverGroupId = await permissionService.GetUserGroupInEventAsync(approverLoginId, guest.EventId);
        if (!approverGroupId.HasValue)
            throw new InvalidOperationException("User not assigned to a group");

        if (!await permissionService.IsGroupInUserScopeAsync(
                guest.EventId,
                guest.GroupId,
                approverGroupId.Value))
        {
            throw new UnauthorizedAccessException(
                "Cannot approve or reject guests outside your group hierarchy");
        }
    }
    
    public async Task UpdateGuestAsync(long guestId, long loginId, string name, string? email, string? phone, long groupId, long? categoryId, IReadOnlyCollection<long> tagIds, long? placementId = null, int? placementSeatNumber = null)
    {
        var guest = await guestRepository.GetByIdAsync(guestId) ?? throw new InvalidOperationException("Guest not found");
        await placements.Transaction(guest.EventId, async () => { await UpdateGuestCoreAsync(guestId, loginId, name, email, phone, groupId, categoryId, tagIds, placementId, placementSeatNumber); return true; });
    }

    private async Task UpdateGuestCoreAsync(
        long guestId,
        long loginId,
        string name,
        string? email,
        string? phone,
        long groupId,
        long? categoryId,
        IReadOnlyCollection<long> tagIds, long? placementId = null, int? placementSeatNumber = null)
    {
        var guest = await guestRepository.GetByIdAsync(guestId);
        if (guest == null)
            throw new InvalidOperationException($"Guest {guestId} not found");

        await eventStateGuard.EnsureActiveAsync(guest.EventId);

        await EnsureCanManageGuestAsync(guest, loginId);

        var targetGroup = await groupRepository.GetByIdAsync(groupId);
        if (targetGroup == null || targetGroup.EventId != guest.EventId)
            throw new InvalidOperationException("Target group does not belong to the guest event");

        var userGroupId = await permissionService.GetUserGroupInEventAsync(loginId, guest.EventId);
        if (!userGroupId.HasValue ||
            !await permissionService.IsGroupInUserScopeAsync(guest.EventId, groupId, userGroupId.Value))
        {
            throw new UnauthorizedAccessException("Cannot move guest outside your group hierarchy");
        }

        if (groupId != guest.GroupId && guest.Status != "rejected" && await GetAvailableQuotaInGroupAsync(groupId) <= 0)
            throw new InvalidOperationException("Target group quota is full");

        await EnsureCategoryBelongsToEventAsync(guest.EventId, categoryId);
        var normalizedTagIds = await EnsureTagsBelongToEventAsync(guest.EventId, tagIds);

        var requestedSeat = placementSeatNumber ?? (guest.PlacementId == placementId ? guest.PlacementSeatNumber : null);
        var resolvedSeatNumber = await placements.ResolveSeat(guest.EventId, groupId, placementId, guest.Id, requestedSeat);
        guest.PlacementId = placementId;
        guest.PlacementSeatNumber = resolvedSeatNumber;
        guest.Name = name;
        guest.Email = email;
        guest.Phone = phone;
        guest.GroupId = groupId;
        
        await guestRepository.UpdateAsync(guest);
        await guestRepository.SetGuestCategoryAsync(guest.Id, categoryId);
        await guestRepository.SetGuestTagsAsync(guest.Id, normalizedTagIds);
        await guestRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            guest.EventId,
            loginId,
            "updated",
            "Guest",
            guest.Id,
            "Изменён гость",
            BuildGuestDescription(guest.Name, guest.Email, guest.Phone));
    }
    
    public async Task DeleteGuestAsync(long guestId, long loginId)
    {
        var guest = await guestRepository.GetByIdAsync(guestId);
        if (guest == null)
            throw new InvalidOperationException($"Guest {guestId} not found");

        await eventStateGuard.EnsureActiveAsync(guest.EventId);

        await EnsureCanManageGuestAsync(guest, loginId);
        var guestName = guest.Name;
        var guestEmail = guest.Email;
        var guestPhone = guest.Phone;

        var actor = await GetActorAsync(loginId, guest.EventId);
        guest.IsDeleted = true;
        guest.DeletedAt = DateTimeOffset.UtcNow;
        guest.DeletedByUserId = actor.Id;
        guest.PlacementId = null;
        guest.PlacementSeatNumber = null;
        await guestRepository.UpdateAsync(guest);
        await guestRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            guest.EventId,
            loginId,
            "deleted",
            "Guest",
            guestId,
            "Удалён гость",
            BuildGuestDescription(guestName, guestEmail, guestPhone));
    }

    public async Task RestoreDeletedGuestAsync(long guestId, long loginId)
    {
        var guest = await guestRepository.GetByIdAsync(guestId, includeDeleted: true);
        if (guest == null)
            throw new InvalidOperationException($"Guest {guestId} not found");
        if (!guest.IsDeleted)
            throw new InvalidOperationException("Guest is not deleted");

        await eventStateGuard.EnsureActiveAsync(guest.EventId);
        await EnsureCanManageGuestAsync(guest, loginId);

        guest.IsDeleted = false;
        guest.DeletedAt = null;
        guest.DeletedByUserId = null;
        await guestRepository.UpdateAsync(guest);
        await guestRepository.SaveChangesAsync();

        await eventLogService.AddAsync(
            guest.EventId,
            loginId,
            "restored",
            "Guest",
            guest.Id,
            "Гость восстановлен",
            BuildGuestDescription(guest.Name, guest.Email, guest.Phone));
    }

    public async Task<GuestBulkSummary> GetBulkSummaryAsync(
        long eventId,
        long loginId,
        GuestSelection selection)
    {
        var guests = await guestRepository.GetForBulkAsync(eventId, NormalizeSelection(selection));
        var actions = new[]
        {
            (Action: "submit", Label: "Отправить на согласование"),
            (Action: "approve", Label: "Согласовать"),
            (Action: "reject", Label: "Отклонить"),
            (Action: "invite", Label: "Пригласить"),
            (Action: "restore_to_saved", Label: "Вернуть в сохранённые"),
            (Action: "delete", Label: "Удалить"),
            (Action: "restore_deleted", Label: "Восстановить")
        };

        var options = new List<GuestBulkActionOption>();
        foreach (var action in actions)
        {
            var eligible = 0;
            foreach (var guest in guests)
            {
                if (await GetBulkActionErrorAsync(guest, loginId, action.Action) == null)
                    eligible++;
            }

            if (eligible > 0)
                options.Add(new GuestBulkActionOption(action.Action, action.Label, eligible));
        }

        return new GuestBulkSummary(guests.Count, options);
    }

    public async Task<GuestBulkActionResult> ExecuteBulkActionAsync(
        long eventId,
        long loginId,
        string action,
        GuestSelection selection)
    {
        action = action.Trim().ToLowerInvariant();
        var normalized = NormalizeSelection(selection);
        var guests = await guestRepository.GetForBulkAsync(eventId, normalized);
        var reasons = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var changed = 0;

        foreach (var guest in guests)
        {
            var error = await GetBulkActionErrorAsync(guest, loginId, action);
            if (error != null)
            {
                reasons[error] = reasons.GetValueOrDefault(error) + 1;
                continue;
            }

            try
            {
                switch (action)
                {
                    case "submit": await SubmitGuestForReviewAsync(guest.Id, loginId); break;
                    case "approve": await ApproveGuestAsync(guest.Id, loginId); break;
                    case "reject": await RejectGuestAsync(guest.Id, loginId); break;
                    case "invite": await InviteGuestAsync(guest.Id, loginId); break;
                    case "restore_to_saved": await RestoreGuestToSavedAsync(guest.Id, loginId); break;
                    case "delete": await DeleteGuestAsync(guest.Id, loginId); break;
                    case "restore_deleted": await RestoreDeletedGuestAsync(guest.Id, loginId); break;
                    default: throw new InvalidOperationException("Unknown bulk action");
                }
                changed++;
            }
            catch (Exception ex) when (ex is InvalidOperationException or UnauthorizedAccessException)
            {
                reasons[ex.Message] = reasons.GetValueOrDefault(ex.Message) + 1;
            }
        }

        var skipped = guests.Count - changed;
        return new GuestBulkActionResult(
            guests.Count,
            changed,
            skipped,
            reasons.Select(item => new GuestBulkSkipReason(item.Key, item.Value)).ToList());
    }

    private static GuestSelection NormalizeSelection(GuestSelection selection) => selection with
    {
        GuestIds = selection.GuestIds.Where(id => id > 0).Distinct().ToList(),
        ExcludedGuestIds = selection.ExcludedGuestIds.Where(id => id > 0).Distinct().ToList(),
        Search = selection.Search?.Trim() is { Length: >= 2 } search ? search : null,
        Statuses = selection.Statuses.Where(KnownStatuses.Contains).Select(value => value.ToLowerInvariant()).Distinct().ToList(),
        CategoryIds = selection.CategoryIds.Where(id => id > 0).Distinct().ToList(),
        TagIds = selection.TagIds.Where(id => id > 0).Distinct().ToList(),
        GroupIds = selection.GroupIds.Where(id => id > 0).Distinct().ToList(),
        CreatedByUserIds = selection.CreatedByUserIds.Where(id => id > 0).Distinct().ToList()
    };

    private async Task<string?> GetBulkActionErrorAsync(Application.Entities.Guest guest, long loginId, string action)
    {
        var requiresApproval = action is "approve" or "reject" or "restore_to_saved";
        var permission = requiresApproval ? "approve_guest" : "create_guest";
        if (!await permissionService.HasPermissionAsync(loginId, guest.EventId, permission))
            return "Недостаточно прав";

        try
        {
            if (requiresApproval)
                await EnsureGuestIsInApproverScopeAsync(guest, loginId);
            else
                await EnsureCanManageGuestAsync(guest, loginId);
        }
        catch (Exception ex) when (ex is InvalidOperationException or UnauthorizedAccessException)
        {
            return "Гость находится вне доступной группы";
        }

        if (guest.IsDeleted)
            return action == "restore_deleted" ? null : "Гость удалён";
        if (action == "restore_deleted") return "Гость не удалён";
        if (action == "submit" && guest.Status != "saved") return "Неверный текущий статус";
        if (action == "invite" && guest.Status != "approved") return "Неверный текущий статус";
        if (action == "restore_to_saved" && guest.Status != "rejected") return "Неверный текущий статус";
        if (action == "reject" && guest.Status is "saved" or "rejected") return "Неверный текущий статус";
        if (action == "approve")
        {
            var actor = await GetActorAsync(loginId, guest.EventId);
            var isAdministrator = string.Equals(actor.Role?.Name, "Administrator", StringComparison.OrdinalIgnoreCase);
            if (guest.Status != "on_review" && !(guest.Status == "admin_review" && isAdministrator))
                return "Неверный текущий статус";
        }
        if (action is not ("submit" or "approve" or "reject" or "invite" or "restore_to_saved" or "delete" or "restore_deleted"))
            return "Неизвестное действие";

        return null;
    }

    private async Task EnsureCanManageGuestAsync(Application.Entities.Guest guest, long loginId)
    {
        if (!await permissionService.HasPermissionAsync(loginId, guest.EventId, "create_guest"))
            throw new UnauthorizedAccessException("No permission to manage guests");

        var userGroupId = await permissionService.GetUserGroupInEventAsync(loginId, guest.EventId);
        if (!userGroupId.HasValue ||
            !await permissionService.IsGroupInUserScopeAsync(guest.EventId, guest.GroupId, userGroupId.Value))
        {
            throw new UnauthorizedAccessException("Cannot manage guest outside your group hierarchy");
        }
    }

    private async Task<Application.Entities.User> GetActorAsync(long loginId, long eventId)
    {
        return await userRepository.GetByLoginAndEventAsync(loginId, eventId)
            ?? throw new InvalidOperationException("Employee was not found in the event");
    }

    private async Task EnsureCategoryBelongsToEventAsync(long eventId, long? categoryId)
    {
        if (!categoryId.HasValue)
            throw new InvalidOperationException("Guest category is required");

        var category = await categoryRepository.GetByIdAsync(categoryId.Value);
        if (category == null || category.EventId != eventId)
            throw new InvalidOperationException("Category does not belong to the guest event");
    }

    private async Task<List<long>> EnsureTagsBelongToEventAsync(long eventId, IReadOnlyCollection<long>? tagIds)
    {
        var normalizedTagIds = tagIds?
            .Where(id => id > 0)
            .Distinct()
            .ToList() ?? [];

        if (normalizedTagIds.Count > 4)
            throw new InvalidOperationException("A guest can have at most 4 tags");

        if (normalizedTagIds.Count == 0)
            return normalizedTagIds;

        var tags = await tagRepository.GetByIdsAsync(normalizedTagIds);
        if (tags.Count != normalizedTagIds.Count || tags.Any(tag => tag.EventId != eventId))
            throw new InvalidOperationException("All tags must belong to the guest event");

        return normalizedTagIds;
    }

    private static string FormatUserName(Application.Entities.User user) =>
        string.Join(" ", new[] { user.Surname, user.Name, user.AdditionalName }
            .Where(value => !string.IsNullOrWhiteSpace(value)));

    private static string BuildGuestDescription(string name, string? email, string? phone)
    {
        var details = new List<string> { $"Гость: {name}" };
        if (!string.IsNullOrWhiteSpace(email))
            details.Add($"email: {email}");
        if (!string.IsNullOrWhiteSpace(phone))
            details.Add($"телефон: {phone}");

        return string.Join(", ", details);
    }

    private static string GetStatusLabel(string status) => status switch
    {
        "saved" => "Сохранён",
        "on_review" => "На согласовании",
        "admin_review" => "На согласовании администратора",
        "approved" => "Согласован",
        "invited" => "Приглашён",
        "rejected" => "Отклонён",
        _ => status
    };
    
    private async Task<int> GetAvailableQuotaInGroupAsync(long groupId)
    {
        var group = await groupRepository.GetByIdAsync(groupId);
        if (group == null)
            return 0;
        
        // available = quota - sum(children_quotas) - count(guests)
        var children = await groupRepository.GetChildrenAsync(groupId);
        var childrenQuotaSum = children.Sum(g => g.Quota);
        var guestCount = await guestRepository.GetGuestCountByGroupAsync(groupId);
        
        var available = group.Quota - childrenQuotaSum - guestCount;
        return Math.Max(0, available);
    }
}
