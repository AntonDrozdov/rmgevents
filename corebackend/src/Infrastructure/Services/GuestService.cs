using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed class GuestService(
    IGuestRepository guestRepository,
    IGroupRepository groupRepository,
    IPermissionService permissionService,
    IUserRepository userRepository) : IGuestService
{
    public async Task<Application.Entities.Guest> CreateGuestAsync(
        long eventId,
        long userId,
        string name,
        string? email,
        string? phone,
        long groupId)
    {
        // Проверяем разрешение
        if (!await permissionService.HasPermissionAsync(userId, eventId, "create_guest"))
            throw new UnauthorizedAccessException("No permission to create guests");
        
        // Получаем группу пользователя
        var userGroupId = await permissionService.GetUserGroupInEventAsync(userId, eventId);
        if (!userGroupId.HasValue)
            throw new InvalidOperationException("User not assigned to a group");
        
        // Проверяем иерархию групп
        if (!await permissionService.CanCreateGuestInGroupAsync(userId, eventId, groupId, userGroupId.Value))
            throw new UnauthorizedAccessException("Cannot create guest in this group");
        
        // Проверяем квоту
        var availableQuota = await GetAvailableQuotaInGroupAsync(groupId);
        if (availableQuota <= 0)
            throw new InvalidOperationException("Group quota is full");
        
        var guest = new Application.Entities.Guest
        {
            Id = 0,
            EventId = eventId,
            GroupId = groupId,
            CreatedByUserId = userId,
            Name = name,
            Email = email,
            Phone = phone,
            Status = "saved",
            CreatedAt = DateTimeOffset.UtcNow
        };
        
        await guestRepository.AddAsync(guest);
        await guestRepository.SaveChangesAsync();
        
        return guest;
    }
    
    public async Task<Application.Entities.Guest?> GetGuestAsync(long guestId)
    {
        return await guestRepository.GetByIdAsync(guestId);
    }
    
    public async Task<List<Application.Entities.Guest>> GetGuestsByEventAsync(long eventId)
    {
        return await guestRepository.GetByEventIdAsync(eventId);
    }
    
    public async Task<List<Application.Entities.Guest>> GetGuestsByGroupAsync(long groupId)
    {
        return await guestRepository.GetByGroupIdAsync(groupId);
    }
    
    public async Task<List<Application.Entities.Guest>> GetGuestsByStatusAsync(long eventId, string status)
    {
        return await guestRepository.GetByStatusAsync(eventId, status);
    }
    
    public async Task SubmitGuestForReviewAsync(long guestId, long userId)
    {
        var guest = await guestRepository.GetByIdAsync(guestId);
        if (guest == null)
            throw new InvalidOperationException($"Guest {guestId} not found");

        await EnsureCanManageGuestAsync(guest, userId);
        if (guest.Status != "saved")
            throw new InvalidOperationException("Only a saved guest can be submitted for review");

        var actor = await GetActorAsync(userId, guest.EventId);
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
    }

    public async Task ApproveGuestAsync(long guestId, long approverUserId)
    {
        var guest = await guestRepository.GetByIdAsync(guestId);
        if (guest == null)
            throw new InvalidOperationException($"Guest {guestId} not found");
        
        // Проверяем разрешение
        if (!await permissionService.HasPermissionAsync(approverUserId, guest.EventId, "approve_guest"))
            throw new UnauthorizedAccessException("No permission to approve guests");

        await EnsureGuestIsInApproverScopeAsync(guest, approverUserId);

        var actor = await GetActorAsync(approverUserId, guest.EventId);
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
    }
    
    public async Task RejectGuestAsync(long guestId, long approverUserId)
    {
        var guest = await guestRepository.GetByIdAsync(guestId);
        if (guest == null)
            throw new InvalidOperationException($"Guest {guestId} not found");

        if (!await permissionService.HasPermissionAsync(approverUserId, guest.EventId, "approve_guest"))
            throw new UnauthorizedAccessException("No permission to reject guests");

        await EnsureGuestIsInApproverScopeAsync(guest, approverUserId);

        if (guest.Status == "saved")
            throw new InvalidOperationException("A saved guest cannot be rejected");
        if (guest.Status == "rejected")
            throw new InvalidOperationException("Guest is already rejected");

        var actor = await GetActorAsync(approverUserId, guest.EventId);
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
    }

    public async Task InviteGuestAsync(long guestId, long inviterUserId)
    {
        var guest = await guestRepository.GetByIdAsync(guestId);
        if (guest == null)
            throw new InvalidOperationException($"Guest {guestId} not found");

        if (!await permissionService.HasPermissionAsync(inviterUserId, guest.EventId, "create_guest"))
            throw new UnauthorizedAccessException("No permission to invite guests");

        await EnsureCanManageGuestAsync(guest, inviterUserId);

        if (guest.Status != "approved")
            throw new InvalidOperationException("Only an approved guest can be invited");

        var actor = await GetActorAsync(inviterUserId, guest.EventId);
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
    }

    public async Task RestoreGuestToSavedAsync(long guestId, long userId)
    {
        var guest = await guestRepository.GetByIdAsync(guestId);
        if (guest == null)
            throw new InvalidOperationException($"Guest {guestId} not found");

        if (!await permissionService.HasPermissionAsync(userId, guest.EventId, "approve_guest"))
            throw new UnauthorizedAccessException("No permission to restore guests");

        await EnsureGuestIsInApproverScopeAsync(guest, userId);

        if (guest.Status != "rejected")
            throw new InvalidOperationException("Only a rejected guest can be restored");

        var actor = await GetActorAsync(userId, guest.EventId);
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
    }

    private async Task EnsureGuestIsInApproverScopeAsync(Application.Entities.Guest guest, long approverUserId)
    {
        var approverGroupId = await permissionService.GetUserGroupInEventAsync(approverUserId, guest.EventId);
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
    
    public async Task UpdateGuestAsync(
        long guestId,
        long userId,
        string name,
        string? email,
        string? phone,
        long groupId)
    {
        var guest = await guestRepository.GetByIdAsync(guestId);
        if (guest == null)
            throw new InvalidOperationException($"Guest {guestId} not found");

        await EnsureCanManageGuestAsync(guest, userId);

        var targetGroup = await groupRepository.GetByIdAsync(groupId);
        if (targetGroup == null || targetGroup.EventId != guest.EventId)
            throw new InvalidOperationException("Target group does not belong to the guest event");

        var userGroupId = await permissionService.GetUserGroupInEventAsync(userId, guest.EventId);
        if (!userGroupId.HasValue ||
            !await permissionService.IsGroupInUserScopeAsync(guest.EventId, groupId, userGroupId.Value))
        {
            throw new UnauthorizedAccessException("Cannot move guest outside your group hierarchy");
        }

        if (groupId != guest.GroupId && guest.Status != "rejected" && await GetAvailableQuotaInGroupAsync(groupId) <= 0)
            throw new InvalidOperationException("Target group quota is full");

        guest.Name = name;
        guest.Email = email;
        guest.Phone = phone;
        guest.GroupId = groupId;
        
        await guestRepository.UpdateAsync(guest);
        await guestRepository.SaveChangesAsync();
    }
    
    public async Task DeleteGuestAsync(long guestId, long userId)
    {
        var guest = await guestRepository.GetByIdAsync(guestId);
        if (guest == null)
            throw new InvalidOperationException($"Guest {guestId} not found");

        await EnsureCanManageGuestAsync(guest, userId);
        await guestRepository.DeleteAsync(guestId);
        await guestRepository.SaveChangesAsync();
    }

    private async Task EnsureCanManageGuestAsync(Application.Entities.Guest guest, long userId)
    {
        if (!await permissionService.HasPermissionAsync(userId, guest.EventId, "create_guest"))
            throw new UnauthorizedAccessException("No permission to manage guests");

        var userGroupId = await permissionService.GetUserGroupInEventAsync(userId, guest.EventId);
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

    private static string FormatUserName(Application.Entities.User user) =>
        string.Join(" ", new[] { user.Surname, user.Name, user.AdditionalName }
            .Where(value => !string.IsNullOrWhiteSpace(value)));
    
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
