$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$python = Join-Path $root '.venv\Scripts\python.exe'

if (!(Test-Path $python)) {
    throw 'Python environment not found. Run scripts\setup.ps1 first.'
}

Start-Process -FilePath $python -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000' -WorkingDirectory (Join-Path $root 'backend')
Set-Location (Join-Path $root 'frontend')
npm.cmd run dev -- --host 127.0.0.1
