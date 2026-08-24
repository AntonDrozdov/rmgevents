using Api.Contracts;
using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(IAdminTokenService tokenService) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("login")]
    public ActionResult<LoginResponse> Login(LoginRequest request)
    {
        var token = tokenService.CreateToken(request.Username, request.Password);
        return token is null ? Unauthorized() : Ok(new LoginResponse(token));
    }
}
