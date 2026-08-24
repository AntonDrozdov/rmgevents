using Api.Contracts;
using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(IAuthService authService) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request)
    {
        var token = await authService.LoginAsync(request.Username, request.Password);
        if (token == null)
            return Unauthorized();
        
        // Get available events for this login
        // Note: We need to get loginId from the token, but since login was successful,
        // we can get the user from the login
        var login = await authService.GetAvailableEventsAsync(Guid.Parse(request.Username));
        
        var events = login.Select(l => new EventOption(l.EventId, l.EventName, l.RoleName)).ToList();
        
        return Ok(new LoginResponse(token, events));
    }
    
    [AllowAnonymous]
    [HttpPost("register")]
    public async Task<ActionResult<dynamic>> Register(
        [FromBody] dynamic request)
    {
        var username = request.Username;
        var password = request.Password;
        var displayName = request.DisplayName;
        
        var loginId = await authService.RegisterUserAsync(username, password, displayName);
        if (loginId == null)
            return BadRequest("Username already exists");
        
        return Ok(new { loginId });
    }
}
