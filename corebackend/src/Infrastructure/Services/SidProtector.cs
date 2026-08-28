using System.Security.Cryptography;
using System.Text;
using Application.Services;
using Microsoft.Extensions.Configuration;

namespace Infrastructure.Services;

public sealed class SidProtector : ISidProtector
{
    private const int NonceSize = 12;
    private const int TagSize = 16;
    private readonly byte[] _key;

    public SidProtector(IConfiguration configuration)
    {
        var secret = configuration["Jwt:SidKey"]
            ?? throw new InvalidOperationException("SID encryption key is not configured.");
        _key = SHA256.HashData(Encoding.UTF8.GetBytes(secret));
    }

    public string Protect(string jwt)
    {
        var plaintext = Encoding.UTF8.GetBytes(jwt);
        var nonce = RandomNumberGenerator.GetBytes(NonceSize);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[TagSize];

        using var aes = new AesGcm(_key, TagSize);
        aes.Encrypt(nonce, plaintext, ciphertext, tag);

        var payload = new byte[NonceSize + TagSize + ciphertext.Length];
        nonce.CopyTo(payload, 0);
        tag.CopyTo(payload, NonceSize);
        ciphertext.CopyTo(payload, NonceSize + TagSize);
        return Base64UrlEncode(payload);
    }

    public bool TryUnprotect(string sid, out string jwt)
    {
        jwt = string.Empty;
        try
        {
            var payload = Base64UrlDecode(sid);
            if (payload.Length <= NonceSize + TagSize) return false;

            var nonce = payload.AsSpan(0, NonceSize);
            var tag = payload.AsSpan(NonceSize, TagSize);
            var ciphertext = payload.AsSpan(NonceSize + TagSize);
            var plaintext = new byte[ciphertext.Length];

            using var aes = new AesGcm(_key, TagSize);
            aes.Decrypt(nonce, ciphertext, tag, plaintext);
            jwt = Encoding.UTF8.GetString(plaintext);
            return true;
        }
        catch (Exception exception) when (exception is FormatException or CryptographicException)
        {
            return false;
        }
    }

    private static string Base64UrlEncode(byte[] value)
        => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string value)
    {
        var base64 = value.Replace('-', '+').Replace('_', '/');
        base64 += new string('=', (4 - base64.Length % 4) % 4);
        return Convert.FromBase64String(base64);
    }
}
