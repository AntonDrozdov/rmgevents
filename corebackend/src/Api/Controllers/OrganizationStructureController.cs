using Api.Contracts;
using Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Api.Controllers;

[ApiController]
[Route("api/events/{eventId}/organization-structure")]
[Authorize]
public sealed class OrganizationStructureController(IOrganizationStructureService organizationStructureService) : ControllerBase
{
    [HttpGet("tree")]
    public async Task<ActionResult<OrganizationStructureTreeDto>> GetTree(
        long eventId,
        CancellationToken cancellationToken)
    {
        var loginId = long.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        try
        {
            var tree = await organizationStructureService.GetTreeAsync(eventId, loginId, cancellationToken);
            return Ok(MapTree(tree));
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid(ex.Message);
        }
    }

    private static OrganizationStructureTreeDto MapTree(OrganizationStructureTree tree) =>
        new(
            tree.Departments.Select(MapDepartment).ToList(),
            tree.DepartmentsCount,
            tree.EmployeesCount,
            tree.LoadedAt);

    private static OrganizationDepartmentTreeItemDto MapDepartment(OrganizationDepartmentTreeItem department) =>
        new(
            department.Id,
            department.ParentId,
            department.Name,
            department.IsGeneratedFromParentName,
            department.Employees.Select(MapEmployee).ToList(),
            department.Children.Select(MapDepartment).ToList());

    private static OrganizationEmployeeTreeItemDto MapEmployee(OrganizationEmployeeTreeItem employee) =>
        new(
            employee.Id,
            employee.DepartmentId,
            employee.FullName,
            employee.Surname,
            employee.Name,
            employee.AdditionalName,
            employee.Position,
            employee.SourceRowNumber);
}
