@echo off
setlocal

set "REMOTE_HOST=root@45.12.238.40"
set "REMOTE_DIR=/opt/rmgevents"
set "APP_VERSION="
for /f "usebackq tokens=1,2 delims==" %%A in ("%~dp0.env") do if "%%A"=="APP_VERSION" set "APP_VERSION=%%B"
if not defined APP_VERSION goto :error

if not exist "%~dp0docker-compose.yml" goto :error

echo Checking images for version %APP_VERSION%...
docker image inspect rmgevents-corebackend:%APP_VERSION% rmgevents-frontend:%APP_VERSION% >nul
if errorlevel 1 goto :error

ssh %REMOTE_HOST% "mkdir -p %REMOTE_DIR%"
if errorlevel 1 goto :error

echo Loading images directly into Docker on the server...
docker save rmgevents-corebackend:%APP_VERSION% rmgevents-frontend:%APP_VERSION% | ssh %REMOTE_HOST% "docker load"
if errorlevel 1 goto :error

ssh %REMOTE_HOST% "docker image inspect rmgevents-corebackend:%APP_VERSION% rmgevents-frontend:%APP_VERSION% > /dev/null"
if errorlevel 1 goto :error

echo Transferring server Compose and version %APP_VERSION%...
scp "%~dp0docker-compose.yml" "%~dp0.env" "%REMOTE_HOST%:%REMOTE_DIR%/"
if errorlevel 1 goto :error

ssh %REMOTE_HOST% "cd %REMOTE_DIR% && env -u APP_VERSION docker compose --env-file .env -f docker-compose.yml config --images"
if errorlevel 1 goto :error

echo.
echo ========================================
echo Images and server configuration for %APP_VERSION% transferred successfully.
echo Remote directory: %REMOTE_DIR%
echo Containers were not restarted.
echo Start with: cd %REMOTE_DIR% ^&^& docker compose --env-file .env up -d --no-build --pull never
echo ========================================
echo.
pause
exit /b 0

:error
echo.
echo ========================================
echo Transfer failed. Check the output above.
echo ========================================
echo.
pause
exit /b 1
