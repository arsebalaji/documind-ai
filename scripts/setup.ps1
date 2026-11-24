$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

if (!(Test-Path .env)) {
    Copy-Item .env.example .env
}

python -m venv .venv
if ($LASTEXITCODE -ne 0) { throw 'Python virtual environment creation failed.' }

& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }

Push-Location frontend
try {
    npm.cmd install
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
} finally {
    Pop-Location
}

Write-Host 'Setup complete. Run scripts\start.ps1 to start DocuMind.'
