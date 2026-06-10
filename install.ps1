# copilot-compress installer — Windows (pwsh)
# Usage: pwsh install.ps1 [-Project]
param([switch]$Project)

$src = $PSScriptRoot

if ($Project) {
    $dest = Join-Path (Get-Location) ".github\extensions\copilot-compress"
} else {
    $dest = Join-Path $env:USERPROFILE ".copilot\extensions\copilot-compress"
}

Write-Host "Installing copilot-compress to: $dest"
New-Item -ItemType Directory -Force $dest | Out-Null

# Copy only runtime files — no docs, tests, or CI
Copy-Item "$src\dist\extension.mjs" $dest -Force
Copy-Item "$src\package.json" $dest -Force

Set-Location $dest
npm install --omit=dev
Write-Host "Done. Restart Copilot CLI and type /compress status to verify."
