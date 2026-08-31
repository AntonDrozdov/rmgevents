using Api.Contracts;
using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers;

[ApiController]
[Route("api/events/{eventId}/users")]
[Authorize]
public sealed class UsersController(
    IUserService userService) : ControllerBase
{
    private static UserDto MapUser(Application.Entities.User user) =>
        new(
            user.Id,
            user.EventId,
            user.Role?.Name,
            user.Group?.Name,
            user.Name,
            user.Surname,
            user.AdditionalName,
            user.Email,
            user.Tel,
            user.CreatedAt);

    [HttpGet]
    public async Task<ActionResult<List<UserDto>>> GetEventUsers(long eventId)
    {
        var users = await userService.GetUsersByEventAsync(eventId);
        
        var result = users.Select(MapUser).ToList();
        
        return Ok(result);
    }
    
    [Authorize(Policy = "CanCreateUser")]
    [HttpPost]
    public async Task<ActionResult<UserDto>> CreateUser(
        long eventId,
        CreateUserRequest request)
    {
        try
        {
            var user = await userService.CreateUserAsync(
                eventId,
                request.LoginId,
                request.Name,
                request.Surname,
                request.AdditionalName,
                request.Email,
                request.Tel,
                request.RoleId,
                request.GroupId);
            
            return Created(
                $"/users/{user.Id}",
                MapUser(user));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [Authorize(Policy = "CanCreateUser")]
    [HttpPut("{userId:long}")]
    public async Task<IActionResult> UpdateUser(
        long eventId,
        long userId,
        UpdateUserRequest request)
    {
        try
        {
            var user = await userService.GetUserInEventAsync(userId, eventId);
            if (user == null)
                return NotFound();

            await userService.UpdateUserAsync(
                userId,
                request.Name,
                request.Surname,
                request.AdditionalName,
                request.Email,
                request.Tel);

            await userService.AssignRoleAsync(userId, eventId, request.RoleId, request.GroupId);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [Authorize(Policy = "CanCreateUser")]
    [HttpDelete("{userId:long}")]
    public async Task<IActionResult> DeleteUser(long eventId, long userId)
    {
        var user = await userService.GetUserInEventAsync(userId, eventId);
        if (user == null)
            return NotFound();

        await userService.DeleteUserAsync(userId);
        return NoContent();
    }
}
