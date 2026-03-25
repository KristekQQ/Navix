@echo off
setlocal EnableExtensions

call "%~dp0sync-projects.bat"
if errorlevel 1 exit /b 1

node "%~dp0start-workspace.js" %*
