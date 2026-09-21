param(
    [ValidateSet('patch', 'minor', 'major', 'none')]
    [string]$Bump = 'patch'
)

$ErrorActionPreference = 'Stop'
$versionFile = Join-Path $PSScriptRoot '.env'
$composeFile = Join-Path $PSScriptRoot 'docker-compose.local.yml'
$versionText = (Get-Content -LiteralPath $versionFile -Raw).Trim()
if ($versionText -notmatch '^APP_VERSION=(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') {
    throw 'deploy/.env must contain APP_VERSION in MAJOR.MINOR.PATCH format.'
}
$major = [int]$Matches[1]
$minor = [int]$Matches[2]
$patch = [int]$Matches[3]
switch ($Bump) {
    'major' { $major++; $minor = 0; $patch = 0 }
    'minor' { $minor++; $patch = 0 }
    'patch' { $patch++ }
}
$version = "$major.$minor.$patch"
$previousVersion = $env:APP_VERSION
try {
    $env:APP_VERSION = $version
    docker compose --env-file $versionFile -f $composeFile build
    if ($LASTEXITCODE -ne 0) { throw 'Docker image build failed.' }
    docker compose --env-file $versionFile -f $composeFile up -d --force-recreate
    if ($LASTEXITCODE -ne 0) { throw 'Docker container startup failed.' }
    Set-Content -LiteralPath $versionFile -Value "APP_VERSION=$version" -Encoding ascii
    Write-Host "Started backend and frontend version $version"
} finally {
    $env:APP_VERSION = $previousVersion
}
