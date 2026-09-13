using Api.Contracts;
using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Api.Controllers;

[ApiController]
[Route("api/events/{eventId}/groups")]
[Authorize]
public sealed class GroupsController(
    IGroupService groupService,
    IOrganizationStructureService organizationStructureService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<GroupTreeDto>>> GetGroupTree(long eventId)
    {
        var groups = await groupService.GetGroupHierarchyAsync(eventId);
        return Ok(MapToTreeDtos(groups));
    }
    
    [Authorize(Policy = "CanCreateGroup")]
    [HttpPost]
    public async Task<ActionResult<GroupDto>> CreateGroup(
        long eventId,
        CreateGroupRequest request)
    {
        var userId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        
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

    [Authorize(Policy = "CanCreateGroup")]
    [HttpPut("{groupId}")]
    public async Task<IActionResult> UpdateGroup(
        long eventId,
        long groupId,
        UpdateGroupRequest request)
    {
        var userId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            await groupService.UpdateGroupAsync(eventId, userId, groupId, request.Name, request.Quota);
            return NoContent();
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

    [Authorize(Policy = "CanCreateGroup")]
    [HttpDelete("{groupId}")]
    public async Task<IActionResult> DeleteGroup(long eventId, long groupId)
    {
        var userId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            await groupService.DeleteGroupAsync(eventId, userId, groupId);
            return NoContent();
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

    [Authorize(Policy = "CanCreateEvent")]
    [HttpPost("import-original-structure")]
    public async Task<ActionResult<OrganizationImportResultDto>> ImportOriginalStructure(
        long eventId,
        IFormFile file,
        CancellationToken cancellationToken)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { message = "Выберите XLSX-файл со структурой." });

        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            await using var stream = file.OpenReadStream();
            var result = await organizationStructureService.ImportRmgStructureAsync(
                eventId,
                loginId,
                file.FileName,
                stream,
                cancellationToken);

            return Ok(new OrganizationImportResultDto(
                result.DepartmentsCreated,
                result.EmployeesCreated,
                result.GeneratedParentsCreated,
                result.RowsProcessed,
                result.Warnings));
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [Authorize(Policy = "CanCreateEvent")]
    [HttpPost("apply-original-structure")]
    public async Task<ActionResult<ApplyOriginalStructureResultDto>> ApplyOriginalStructure(
        long eventId,
        CancellationToken cancellationToken)
    {
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            var result = await organizationStructureService.ApplyOriginalStructureAsync(
                eventId,
                loginId,
                cancellationToken);

            return Ok(new ApplyOriginalStructureResultDto(
                result.GroupsCreated,
                result.GroupsReused,
                result.GroupsRenamed,
                result.GroupsQuotaUpdated,
                result.DepartmentsProcessed,
                result.Warnings));
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [Authorize(Policy = "CanCreateEvent")]
    [HttpPost("reset")]
    public async Task<ActionResult<ResetGroupsResultDto>> ResetGroups(long eventId)
    {
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            var result = await groupService.ResetGroupsAsync(eventId, loginId);
            return Ok(new ResetGroupsResultDto(
                result.GroupsDeleted,
                result.GuestsMoved,
                result.UsersMoved,
                result.RootQuota));
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
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
