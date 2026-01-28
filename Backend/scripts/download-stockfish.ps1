$ErrorActionPreference = 'Stop'

$downloadUrl = 'https://github.com/official-stockfish/Stockfish/releases/download/sf_17.1/stockfish-windows-x86-64.zip'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Split-Path -Parent $scriptDir
$binDir = Join-Path $backendDir 'bin'
$zipPath = Join-Path $binDir 'stockfish.zip'
$tempDir = Join-Path $binDir 'stockfish-tmp'
$enginePath = Join-Path $binDir 'stockfish.exe'

New-Item -ItemType Directory -Force $binDir | Out-Null

if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}

Write-Host "Downloading Stockfish from $downloadUrl"
Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath

Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force
Remove-Item $zipPath -Force

$exe = Get-ChildItem -Path $tempDir -Recurse -Filter '*.exe' |
    Where-Object { $_.Name -match 'stockfish' } |
    Select-Object -First 1

if (-not $exe) {
    throw 'Stockfish executable not found in the archive.'
}

Move-Item -Path $exe.FullName -Destination $enginePath -Force
Remove-Item $tempDir -Recurse -Force

Write-Host "Stockfish installed at $enginePath"
