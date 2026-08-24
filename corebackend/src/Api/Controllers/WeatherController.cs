using Api.Contracts;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers;

[ApiController]
[Route("api/weather")]
public sealed class WeatherController : ControllerBase
{
    private static readonly string[] Summaries =
    [
        "Морозно",
        "Прохладно",
        "Облачно",
        "Ясно",
        "Тепло",
        "Жарко"
    ];

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<WeatherForecastDto>>(StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyList<WeatherForecastDto>> Get()
    {
        var forecast = Enumerable.Range(1, 5)
            .Select(index =>
            {
                var temperatureC = Random.Shared.Next(-25, 41);
                return new WeatherForecastDto(
                    DateOnly.FromDateTime(DateTime.UtcNow.AddDays(index)),
                    temperatureC,
                    32 + (int)(temperatureC / 0.5556),
                    Summaries[Random.Shared.Next(Summaries.Length)]);
            })
            .ToArray();

        return Ok(forecast);
    }
}
