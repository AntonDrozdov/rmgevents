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
        var loginResult = await authService.LoginAsync(request.Login, request.Password);
        if (loginResult == null)
            return Unauthorized();
        
        var login = await authService.GetAvailableEventsAsync(loginResult.Value.LoginId);
        
        var events = login.Select(l => new EventOption(l.EventId, l.EventName, l.RoleName)).ToList();
        
        return Ok(new LoginResponse(loginResult.Value.Sid, events));
    }
    
    [AllowAnonymous]
    [HttpPost("register")]
    public async Task<ActionResult<dynamic>> Register(RegisterRequest request)
    {
        var loginId = await authService.RegisterUserAsync(request.Login, request.Password);
        if (loginId == null)
            return BadRequest("Login already exists");
        
        return Ok(new { loginId });
    }
}
