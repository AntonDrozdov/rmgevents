@echo off
setlocal

set "REMOTE_HOST=root@45.12.238.40"

echo Transferring rmgevents-corebackend:latest...
docker save rmgevents-corebackend:latest | ssh %REMOTE_HOST% docker load
if errorlevel 1 goto :error

echo.
echo Transferring rmgevents-frontend:latest...
docker save rmgevents-frontend:latest | ssh %REMOTE_HOST% docker load
if errorlevel 1 goto :error

echo.
echo ========================================
echo All images transferred successfully.
echo ========================================
echo.
pause
exit /b 0

:error
echo.
echo ========================================
echo Image transfer failed. Check the output above.
echo ========================================
echo.
pause
exit /b 1
