@echo off
title Free-Panel LAN Navigation
cd /d %~dp0
echo ============================================
echo   Free-Panel  LAN Navigation
echo   URL:      http://localhost:8080
echo   LAN:      http://YOUR-LAN-IP:8080
echo   Account:  admin / admin123
echo   Press Ctrl+C to stop.
echo ============================================
php -S 0.0.0.0:8080 -t .
pause
