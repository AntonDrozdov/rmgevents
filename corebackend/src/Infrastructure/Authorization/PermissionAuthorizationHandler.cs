using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using System.Security.Claims;

namespace Infrastructure.Authorization;

public class PermissionAuthorizationHandler(IPermissionService permissionService) : AuthorizationHandler<PermissionRequirement>
{
    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        PermissionRequirement requirement)
    {
        // Получаем userId из Claims
        var userIdClaim = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userIdClaim == null || !Guid.TryParse(userIdClaim, out var userId))
        {
            context.Fail();
            return;
        }
        
        // Получаем eventId из route (если требуется)
        // Это будет передано из контроллера
        var httpContext = context.Resource as HttpContext;
        if (httpContext == null)
        {
            context.Fail();
            return;
        }
        
        var routeData = httpContext.GetRouteData();
        var routeEventId = routeData?.Values["eventId"]?.ToString();
        
        if (string.IsNullOrEmpty(routeEventId) || !Guid.TryParse(routeEventId, out var eventId))
        {
            context.Fail();
            return;
        }
        
        // Проверяем разрешение в БД
        var hasPermission = await permissionService.HasPermissionAsync(userId, eventId, requirement.Permission);
        
        if (hasPermission)
            context.Succeed(requirement);
        else
            context.Fail();
    }
}
