using Api.Contracts;
using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers;

[ApiController]
[Route("api/events/{eventId}/roles")]
[Authorize]
public sealed class RolesController(IRoleService roleService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<RoleDto>>> GetEventRoles(long eventId)
    {
        var roles = await roleService.GetRolesByEventAsync(eventId);
        var result = roles.Select(role => new RoleDto(
            role.Id,
            role.EventId,
            role.Name,
            role.RolePermissions
                .Where(item => item.Permission != null)
                .Select(item => new PermissionDto(
                    item.Permission!.Id,
                    item.Permission.Code,
                    item.Permission.Description))
                .ToList(),
            role.CreatedAt)).ToList();

        return Ok(result);
    }
}
