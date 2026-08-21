# KTW — KinoTeka Watch installer for Windows (PowerShell)
# Запуск: irm https://raw.githubusercontent.com/FLEXIY0/KinoTeka-Watch/claude/direct-tui-bun-install-d9bhfq/cli/install.ps1 | iex

$ErrorActionPreference = "Stop"

$RepoUrl = if ($env:KTW_REPO) { $env:KTW_REPO } else { "https://github.com/FLEXIY0/KinoTeka-Watch.git" }
$RepoBranch = if ($env:KTW_BRANCH) { $env:KTW_BRANCH } else { "claude/direct-tui-bun-install-d9bhfq" }
$InstallDir = if ($env:KTW_HOME) { $env:KTW_HOME } else { "$env:USERPROFILE\.local\share\ktw2" }
$BinDir = if ($env:KTW_BIN) { $env:KTW_BIN } else { "$env:USERPROFILE\.local\bin" }

function Write-Ok($msg)   { Write-Host "  [✓] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }
function Write-Bad($msg)  { Write-Host "  [✗] $msg" -ForegroundColor Red }
function Write-Step($msg) { Write-Host "`n$msg" -ForegroundColor Cyan }
function Write-Dim($msg)  { Write-Host "  $msg" -ForegroundColor Gray }

Write-Host @"
┌──────────────────────────────────────────────┐
│  ktw · KinoTeka Watch в Windows Terminal     │
│  Прямой парсинг балансеров ⚡ и просмотр mpv │
└──────────────────────────────────────────────┘
"@ -ForegroundColor Cyan

# 1. Проверка и установка Bun
Write-Step "1. Рантайм"
$BunPath = "$env:USERPROFILE\.bun\bin\bun.exe"
if (Get-Command "bun" -ErrorAction SilentlyContinue) {
    Write-Ok "Bun уже установлен в системе"
} elseif (Test-Path $BunPath) {
    $env:PATH = "$env:USERPROFILE\.bun\bin;$env:PATH"
    Write-Ok "Bun найден в $env:USERPROFILE\.bun\bin"
} else {
    Write-Dim "Устанавливаю Bun..."
    try {
        Invoke-RestMethod -Uri "https://bun.sh/install.ps1" | Invoke-Expression
        $env:PATH = "$env:USERPROFILE\.bun\bin;$env:PATH"
        Write-Ok "Bun успешно установлен"
    } catch {
        Write-Warn "Не удалось установить Bun автоматически. Проверяю Node.js..."
        if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
            Write-Bad "Для работы KTW требуется Bun или Node.js."
            exit 1
        }
        Write-Ok "Использую Node.js"
    }
}

# 2. Проверка mpv
Write-Step "2. Видеоплеер mpv"
if (Get-Command "mpv" -ErrorAction SilentlyContinue) {
    Write-Ok "mpv найден в PATH"
} else {
    Write-Warn "mpv не найден в PATH."
    Write-Dim "Установи через Winget: winget install shinchiro.mpv"
    Write-Dim "Или через Scoop:        scoop install mpv"
}

# 3. Исходники
Write-Step "3. Исходники KTW"
if (Test-Path "$InstallDir\.git") {
    Write-Dim "Обновляю исходники в $InstallDir..."
    try {
        git -C $InstallDir fetch origin $RepoBranch
        git -C $InstallDir checkout -f $RepoBranch
        git -C $InstallDir reset --hard "origin/$RepoBranch"
        Write-Ok "Обновлено до последней версии"
    } catch {
        Remove-Item -Recurse -Force $InstallDir -ErrorAction SilentlyContinue
    }
}

if (-not (Test-Path "$InstallDir\.git")) {
    New-Item -ItemType Directory -Force -Path (Split-Path $InstallDir) | Out-Null
    Write-Dim "Клонирую репозиторий в $InstallDir..."
    git clone --depth 1 --branch $RepoBranch $RepoUrl $InstallDir
    Write-Ok "Исходники скачаны в $InstallDir"
}

# 4. Зависимости
Write-Step "4. Зависимости"
Set-Location $InstallDir
if (Get-Command "bun" -ErrorAction SilentlyContinue) {
    bun install --production
    Write-Ok "Зависимости установлены через Bun"
} else {
    npm install --omit=dev --no-audit --no-fund
    Write-Ok "Зависимости установлены через npm"
}

# 5. Команда ktw (нативный .exe, .cmd и .ps1)
Write-Step "5. Создание команды ktw"
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

$Compiled = $false
if (Get-Command "bun" -ErrorAction SilentlyContinue) {
    try {
        Write-Dim "Компилирую быстрый бинарник ktw.exe..."
        bun build --compile --minify "$InstallDir\cli\ktw.js" --outfile "$BinDir\ktw.exe"
        Copy-Item -Force "$BinDir\ktw.exe" "$BinDir\ktw2.exe"
        $Compiled = $true
        Write-Ok "Скомпилирован нативный $BinDir\ktw.exe"
    } catch {
        $Compiled = $false
    }
}

$CmdContent = @"
@echo off
if exist "$env:USERPROFILE\.bun\bin\bun.exe" (
    "$env:USERPROFILE\.bun\bin\bun.exe" "$InstallDir\cli\ktw.js" %*
) else (
    where bun >nul 2>nul && (
        bun "$InstallDir\cli\ktw.js" %*
    ) || (
        node "$InstallDir\cli\ktw.js" %*
    )
)
"@

$Ps1Content = @"
if (Test-Path "$env:USERPROFILE\.bun\bin\bun.exe") {
    & "$env:USERPROFILE\.bun\bin\bun.exe" "$InstallDir\cli\ktw.js" `$args
} elseif (Get-Command "bun" -ErrorAction SilentlyContinue) {
    & bun "$InstallDir\cli\ktw.js" `$args
} else {
    & node "$InstallDir\cli\ktw.js" `$args
}
"@

Set-Content -Path "$BinDir\ktw.cmd" -Value $CmdContent -Encoding ASCII
Set-Content -Path "$BinDir\ktw2.cmd" -Value $CmdContent -Encoding ASCII
Set-Content -Path "$BinDir\ktw.ps1" -Value $Ps1Content -Encoding UTF8
Set-Content -Path "$BinDir\ktw2.ps1" -Value $Ps1Content -Encoding UTF8
Write-Ok "Скрипты запуска созданы: ktw.cmd, ktw2.cmd, ktw.ps1"

# 6. Обновление PATH в текущей сессии и навсегда
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$BinDir", "User")
    Write-Ok "Каталог $BinDir добавлен в системный реестр PATH"
}

# Обновляем PATH прямо в текущем сеансе PowerShell
if ($env:PATH -notlike "*$BinDir*") {
    $env:PATH = "$BinDir;$env:PATH"
}

Write-Host @"

  ✓ Готово! Запускай:
    ktw
    ktw матрица
    ktw --stand

  (Если в текущей вкладке команда ещё не подхватилась, открой новую вкладку терминала или выполни: `$env:PATH = "$BinDir;`$env:PATH")

"@ -ForegroundColor Green
