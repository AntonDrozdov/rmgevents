using System.Text;
using Infrastructure;
using Infrastructure.Authorization;
using Infrastructure.Data;
using Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddInfrastructure(
    builder.Configuration.GetConnectionString("Postgres")
    ?? throw new InvalidOperationException("Connection string 'Postgres' is not configured."));
var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("JWT key is not configured.");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                const string bearerPrefix = "Bearer ";
                var authorization = context.Request.Headers.Authorization.ToString();
                if (!authorization.StartsWith(bearerPrefix, StringComparison.OrdinalIgnoreCase))
                    return Task.CompletedTask;

                var sid = authorization[bearerPrefix.Length..].Trim();
                var protector = context.HttpContext.RequestServices.GetRequiredService<Application.Services.ISidProtector>();
                if (string.IsNullOrWhiteSpace(sid) || !protector.TryUnprotect(sid, out var jwt))
                {
                    context.Fail("Invalid SID.");
                    return Task.CompletedTask;
                }

                context.Token = jwt;
                return Task.CompletedTask;
            }
        };
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"],
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

// Add Authorization with custom policies
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("CanCreateEvent", policy =>
        policy.Requirements.Add(new PermissionRequirement("create_event")));
    
    options.AddPolicy("CanCreateGuest", policy =>
        policy.Requirements.Add(new PermissionRequirement("create_guest", requiresGroup: true)));
    
    options.AddPolicy("CanCreateGroup", policy =>
        policy.Requirements.Add(new PermissionRequirement("create_group", requiresGroup: true)));
    
    options.AddPolicy("CanApproveGuest", policy =>
        policy.Requirements.Add(new PermissionRequirement("approve_guest", requiresGroup: true)));
    
    options.AddPolicy("CanCreateUser", policy =>
        policy.Requirements.Add(new PermissionRequirement("create_user", requiresGroup: true)));
});

// Register authorization handler
builder.Services.AddScoped<IAuthorizationHandler, PermissionAuthorizationHandler>();

builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new()
    {
        Title = "Event Management System API",
        Version = "v1",
        Description = "API для управления мероприятиями с ролевой моделью доступа"
    });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "SID",
        In = ParameterLocation.Header
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        [new OpenApiSecurityScheme
        {
            Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
        }] = Array.Empty<string>()
    });
});

var app = builder.Build();

await using (var scope = app.Services.CreateAsyncScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await dbContext.Database.MigrateAsync();
}

app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "Event Management System API v1");
});

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();
