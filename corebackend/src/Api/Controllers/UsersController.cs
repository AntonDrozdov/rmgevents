using Api.Contracts;
using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Api.Controllers;

[ApiController]
[Route("api/events/{eventId}/users")]
[Authorize]
public sealed class UsersController(
    IUserService userService,
    IPermissionService permissionService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<UserDto>>> GetEventUsers(Guid eventId)
    {
        var users = await userService.GetUsersByEventAsync(eventId);
        
        var result = users.Select(u => new UserDto(
            u.Id,
            u.LoginId,
            u.EventId,
            u.RoleId,
            u.GroupId,
            u.DisplayName,
            u.CreatedAt))
            .ToList();
        
        return Ok(result);
    }
    
    [Authorize(Policy = "CanCreateUser")]
    [HttpPost]
    public async Task<ActionResult<UserDto>> CreateUser(
        Guid eventId,
        CreateUserRequest request)
    {
        var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        
        try
        {
            var user = await userService.CreateUserAsync(
                eventId,
                Guid.Parse(request.Username), // This should be looked up properly
                request.DisplayName,
                request.RoleId,
                request.GroupId);
            
            return Created(
                $"/users/{user.Id}",
                new UserDto(
                    user.Id,
                    user.LoginId,
                    user.EventId,
                    user.RoleId,
                    user.GroupId,
                    user.DisplayName,
                    user.CreatedAt));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }
}
