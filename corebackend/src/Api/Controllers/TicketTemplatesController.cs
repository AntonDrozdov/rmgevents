using Application.Entities;
using Application.Services;
using Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Controllers;
public sealed record TicketTemplateDto(long Id, string Name, long BackgroundImageId, int QrX, int QrY, int QrSize, int QrRadius, bool IsDefault);
public sealed record TicketTemplateInput(string Name, long BackgroundImageId, int QrX, int QrY, int QrSize, int QrRadius);
[ApiController, Authorize(Policy = "CanCreateEvent"), Route("api/events/{eventId:long}/ticket-templates")]
public sealed class TicketTemplatesController(ApplicationDbContext db, IEventStateGuard guard) : ControllerBase
{
    private static TicketTemplateDto Map(TicketTemplate x) => new(x.Id, x.Name, x.BackgroundImageId, x.QrX, x.QrY, x.QrSize, x.QrRadius, x.IsDefault);
    private static void Validate(TicketTemplateInput x) { if (string.IsNullOrWhiteSpace(x.Name) || x.Name.Trim().Length > 120) throw new InvalidOperationException("Укажите название до 120 символов."); if (x.BackgroundImageId < 1 || x.QrX < 0 || x.QrY < 0 || x.QrX > 2400 || x.QrY > 3400 || x.QrSize < 40 || x.QrSize > 1200 || x.QrRadius < 0 || x.QrRadius > x.QrSize / 2 || x.QrX + x.QrSize > 2480 || x.QrY + x.QrSize > 3508) throw new InvalidOperationException("Проверьте координаты и размер QR-кода в границах А4."); }
    [HttpGet] public async Task<List<TicketTemplateDto>> List(long eventId) => await db.TicketTemplates.AsNoTracking().Where(x => x.EventId == eventId).OrderBy(x => x.Id).Select(x => Map(x)).ToListAsync();
    [HttpPost] public async Task<ActionResult<TicketTemplateDto>> Create(long eventId, TicketTemplateInput input) { try { await guard.EnsureActiveAsync(eventId); Validate(input); if (!await db.Images.AnyAsync(x => x.Id == input.BackgroundImageId)) throw new InvalidOperationException("Подложка не найдена."); var first = !await db.TicketTemplates.AnyAsync(x => x.EventId == eventId); var item = new TicketTemplate { EventId = eventId, Name = input.Name.Trim(), BackgroundImageId = input.BackgroundImageId, QrX = input.QrX, QrY = input.QrY, QrSize = input.QrSize, QrRadius = input.QrRadius, IsDefault = first }; db.TicketTemplates.Add(item); await db.SaveChangesAsync(); return Created("", Map(item)); } catch (InvalidOperationException ex) { return BadRequest(ex.Message); } }
    [HttpPut("{id:long}")] public async Task<ActionResult<TicketTemplateDto>> Update(long eventId, long id, TicketTemplateInput input) { try { await guard.EnsureActiveAsync(eventId); Validate(input); var item = await db.TicketTemplates.FirstOrDefaultAsync(x => x.Id == id && x.EventId == eventId) ?? throw new InvalidOperationException("Шаблон не найден."); item.Name = input.Name.Trim(); item.BackgroundImageId = input.BackgroundImageId; item.QrX = input.QrX; item.QrY = input.QrY; item.QrSize = input.QrSize; item.QrRadius = input.QrRadius; await db.SaveChangesAsync(); return Ok(Map(item)); } catch (InvalidOperationException ex) { return BadRequest(ex.Message); } }
    [HttpPost("{id:long}/default")] public async Task<IActionResult> SetDefault(long eventId, long id) { await guard.EnsureActiveAsync(eventId); var items = await db.TicketTemplates.Where(x => x.EventId == eventId).ToListAsync(); var selected = items.SingleOrDefault(x => x.Id == id); if (selected == null) return NotFound(); foreach (var item in items) item.IsDefault = item.Id == id; await db.SaveChangesAsync(); return NoContent(); }
    [HttpDelete("{id:long}")] public async Task<IActionResult> Delete(long eventId, long id) { await guard.EnsureActiveAsync(eventId); var item = await db.TicketTemplates.FirstOrDefaultAsync(x => x.Id == id && x.EventId == eventId); if (item == null) return NotFound(); db.Remove(item); await db.SaveChangesAsync(); var next = await db.TicketTemplates.FirstOrDefaultAsync(x => x.EventId == eventId); if (next != null) { next.IsDefault = true; await db.SaveChangesAsync(); } return NoContent(); }
}
