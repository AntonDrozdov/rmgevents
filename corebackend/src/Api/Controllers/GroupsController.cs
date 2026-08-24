using Api.Contracts;
using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Api.Controllers;

[ApiController]
[Route("api/events/{eventId}/groups")]
[Authorize]
public sealed class GroupsController(
    IGroupService groupService,
    IPermissionService permissionService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<GroupTreeDto>>> GetGroupTree(Guid eventId)
    {
        var groups = await groupService.GetGroupHierarchyAsync(eventId);
        return Ok(MapToTreeDtos(groups));
    }
    
    [Authorize(Policy = "CanCreateGroup")]
    [HttpPost]
    public async Task<ActionResult<GroupDto>> CreateGroup(
        Guid eventId,
        CreateGroupRequest request)
    {
        var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        
        try
        {
            var group = await groupService.CreateGroupAsync(
                eventId,
                userId,
                request.Name,
                request.Quota,
                request.ParentGroupId);
            
            return Created(
                $"/groups/{group.Id}",
                MapToDto(group));
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }
    
    private GroupDto MapToDto(Application.Entities.Group group)
    {
        return new GroupDto(
            group.Id,
            group.EventId,
            group.ParentGroupId,
            group.Name,
            group.Quota,
            0, // UsedQuota - would need to calculate
            group.Quota, // AvailableQuota - would need to calculate
            [], // Children
            group.CreatedAt);
    }
    
    private List<GroupTreeDto> MapToTreeDtos(List<Application.Entities.Group> groups)
    {
        return groups.Select(g => new GroupTreeDto(
            g.Id,
            g.Name,
            g.Quota,
            0, // UsedQuota
            g.Quota, // AvailableQuota
            g.ChildGroups.Any() ? MapToTreeDtos(g.ChildGroups.ToList()) : []))
            .ToList();
    }
}
