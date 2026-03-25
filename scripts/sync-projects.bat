@echo off
setlocal EnableExtensions

for %%I in ("%~dp0..") do set "NAVIX_DIR=%%~fI"
for %%I in ("%NAVIX_DIR%\..") do set "WORKSPACE_DIR=%%~fI"

call :sync_repo "WebP-Animator" "https://github.com/KristekQQ/WebP-Animator.git" "master"
if errorlevel 1 exit /b 1

call :sync_repo "panorama" "https://github.com/KristekQQ/panorama.git" "main"
if errorlevel 1 exit /b 1

call :sync_repo "SFX-HotSwap" "https://github.com/KristekQQ/SFX-HotSwap.git" "main"
if errorlevel 1 exit /b 1

echo.
echo Synchronization finished.
exit /b 0

:sync_repo
set "PROJECT_NAME=%~1"
set "REPO_URL=%~2"
set "BRANCH_NAME=%~3"
set "TARGET_DIR=%WORKSPACE_DIR%\%PROJECT_NAME%"

echo.
echo === %PROJECT_NAME% ===

if exist "%TARGET_DIR%" (
  if not exist "%TARGET_DIR%\.git" (
    echo Existing folder is not a git repository: "%TARGET_DIR%"
    exit /b 1
  )

  echo Updating "%TARGET_DIR%"
  git -C "%TARGET_DIR%" fetch origin || exit /b 1
) else (
  echo Cloning into "%TARGET_DIR%"
  git clone "%REPO_URL%" "%TARGET_DIR%" || exit /b 1
)

git -C "%TARGET_DIR%" checkout "%BRANCH_NAME%" || exit /b 1
git -C "%TARGET_DIR%" pull --ff-only origin "%BRANCH_NAME%" || exit /b 1
exit /b 0
