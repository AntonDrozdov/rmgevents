namespace Application.Services;

public interface ISidProtector
{
    string Protect(string jwt);
    bool TryUnprotect(string sid, out string jwt);
}
