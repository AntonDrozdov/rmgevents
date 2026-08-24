using Application.Repositories;
using Application.Services;

namespace Infrastructure.Services;

public sealed class GuestService(
    IGuestRepository guestRepository,
    IGroupRepository groupRepository,
    IPermissionService permissionService) : IGuestService
{
    public async Task<Application.Entities.Guest> CreateGuestAsync(
        Guid eventId,
        Guid userId,
        string name,
        string? email,
        string? phone,
        Guid groupId)
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
            Id = Guid.NewGuid(),
            EventId = eventId,
            GroupId = groupId,
            CreatedByUserId = userId,
            Name = name,
            Email = email,
            Phone = phone,
            Status = "pending",
            CreatedAt = DateTimeOffset.UtcNow
        };
        
        await guestRepository.AddAsync(guest);
        await guestRepository.SaveChangesAsync();
        
        return guest;
    }
    
    public async Task<Application.Entities.Guest?> GetGuestAsync(Guid guestId)
    {
        return await guestRepository.GetByIdAsync(guestId);
    }
    
    public async Task<List<Application.Entities.Guest>> GetGuestsByEventAsync(Guid eventId)
    {
        return await guestRepository.GetByEventIdAsync(eventId);
    }
    
    public async Task<List<Application.Entities.Guest>> GetGuestsByGroupAsync(Guid groupId)
    {
        return await guestRepository.GetByGroupIdAsync(groupId);
    }
    
    public async Task<List<Application.Entities.Guest>> GetGuestsByStatusAsync(Guid eventId, string status)
    {
        return await guestRepository.GetByStatusAsync(eventId, status);
    }
    
    public async Task ApproveGuestAsync(Guid guestId, Guid approverUserId)
    {
        var guest = await guestRepository.GetByIdAsync(guestId);
        if (guest == null)
            throw new InvalidOperationException($"Guest {guestId} not found");
        
        // Проверяем разрешение
        if (!await permissionService.HasPermissionAsync(approverUserId, guest.EventId, "approve_guest"))
            throw new UnauthorizedAccessException("No permission to approve guests");
        
        guest.Status = "approved";
        guest.ApprovedAt = DateTimeOffset.UtcNow;
        
        await guestRepository.UpdateAsync(guest);
        await guestRepository.SaveChangesAsync();
    }
    
    public async Task RejectGuestAsync(Guid guestId)
    {
        var guest = await guestRepository.GetByIdAsync(guestId);
        if (guest == null)
            throw new InvalidOperationException($"Guest {guestId} not found");
        
        guest.Status = "rejected";
        
        await guestRepository.UpdateAsync(guest);
        await guestRepository.SaveChangesAsync();
    }
    
    public async Task UpdateGuestAsync(Guid guestId, string name, string? email, string? phone)
    {
        var guest = await guestRepository.GetByIdAsync(guestId);
        if (guest == null)
            throw new InvalidOperationException($"Guest {guestId} not found");
        
        guest.Name = name;
        guest.Email = email;
        guest.Phone = phone;
        
        await guestRepository.UpdateAsync(guest);
        await guestRepository.SaveChangesAsync();
    }
    
    public async Task DeleteGuestAsync(Guid guestId)
    {
        await guestRepository.DeleteAsync(guestId);
        await guestRepository.SaveChangesAsync();
    }
    
    private async Task<int> GetAvailableQuotaInGroupAsync(Guid groupId)
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
