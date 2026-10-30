param([string]$FolderId)

$ErrorActionPreference = 'Stop'
if (-not $FolderId) { $FolderId = Read-Host 'Yandex folder ID' }
if ($FolderId -notmatch '^[a-zA-Z0-9_-]{10,64}$') { throw 'Invalid folder ID.' }
$secret = Read-Host 'Yandex API key (hidden input)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ($key -notmatch '^[a-zA-Z0-9_=-]{20,500}$') { throw 'Invalid API key format.' }
    $path = Join-Path $PSScriptRoot '.env.ai'
    $text = "YandexAI__ApiKey=$key`nYandexAI__FolderId=$FolderId`n"
    [IO.File]::WriteAllText($path, $text, [Text.UTF8Encoding]::new($false))
    Write-Host 'Saved deploy/.env.ai (ignored by Git). The key was not printed.'
    Write-Host 'Next: start Docker, then run deploy/rebuild.ps1 -Bump none.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $key = $null
    $text = $null
    $secret.Dispose()
}
