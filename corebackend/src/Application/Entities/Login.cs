namespace Application.Entities;

public sealed class Login
{
    public Guid Id { get; set; }
    public required string Username { get; set; }
    public required string PasswordHash { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    
    // Navigation properties
    public ICollection<User> Users { get; set; } = [];
}
