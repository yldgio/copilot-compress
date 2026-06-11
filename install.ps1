# copilot-compress installer — Windows (pwsh)
# Usage:
#   pwsh install.ps1                       # local install (from clone)
#   pwsh install.ps1 -Project             # project-scoped local install
#   pwsh install.ps1 -Remote              # download latest release, user-wide
#   pwsh install.ps1 -Remote -Tag v1.2.0  # download specific release
#   pwsh install.ps1 -Remote -Project     # download latest, project-scoped
param(
  [switch]$Project,
  [switch]$Remote,
  [string]$Tag = "latest"
)

$GithubRepo = "yldgio/copilot-compress"
$src = $PSScriptRoot

if ($Project) {
  $dest = Join-Path (Get-Location) ".github\extensions\copilot-compress"
} else {
  $dest = Join-Path $env:USERPROFILE ".copilot\extensions\copilot-compress"
}

Write-Host "Installing copilot-compress to: $dest"
New-Item -ItemType Directory -Force $dest | Out-Null

if ($Remote) {
  if ($Tag -eq "latest") {
    $base = "https://github.com/$GithubRepo/releases/latest/download"
  } else {
    $base = "https://github.com/$GithubRepo/releases/download/$Tag"
  }
  Write-Host "Downloading from $base ..."
  Invoke-WebRequest "$base/extension.mjs" -OutFile "$dest\extension.mjs"
  Invoke-WebRequest "$base/package.json"  -OutFile "$dest\package.json"
} else {
  Copy-Item "$src\dist\extension.mjs" "$dest\extension.mjs" -Force
  Copy-Item "$src\package.json" "$dest\package.json" -Force
}

Set-Location $dest
npm install --omit=dev
Write-Host "Done. Restart Copilot CLI and type /compress status to verify."
