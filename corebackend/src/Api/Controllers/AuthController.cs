using Api.Contracts;
using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

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
        
        var events = login.Select(item => new EventOption(
            item.EventId,
            item.EventName,
            item.RoleName,
            item.EventDate,
            item.CreatedAt,
            item.CreatedByName,
            item.LogoImageId)).ToList();
        
        return Ok(new LoginResponse(
            loginResult.Value.Sid,
            events,
            loginResult.Value.MustChangePassword));
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

    [Authorize]
    [HttpPost("change-password")]
    public async Task<ActionResult<ChangePasswordResponse>> ChangePassword(ChangePasswordRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 8)
            return BadRequest("Новый пароль должен содержать не менее 8 символов.");

        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var sid = await authService.ChangePasswordAsync(
            loginId,
            request.CurrentPassword,
            request.NewPassword);

        if (sid == null)
            return BadRequest("Текущий пароль указан неверно.");

        return Ok(new ChangePasswordResponse(sid));
    }
}
