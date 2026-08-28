namespace Application.Entities;

public sealed class Login
{
    public long Id { get; set; }
    public required string LoginValue { get; set; }
    public required string PasswordHash { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    
    // Navigation properties
    public ICollection<User> Users { get; set; } = [];
}
