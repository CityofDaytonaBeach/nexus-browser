[CmdletBinding()]
param(
  [string]$BrowserPath,
  [string]$DevToolsTarget = 'Default',
  [string]$StartUrl = 'http://127.0.0.1:3207/'
)

. (Join-Path $PSScriptRoot 'common.ps1')

$paths = Get-NexusSourcePaths
if ([string]::IsNullOrWhiteSpace($BrowserPath)) {
  $BrowserPath = Join-Path $paths.ChromiumRoot 'out\Nexus\chrome.exe'
}
$BrowserPath = [IO.Path]::GetFullPath($BrowserPath)
if (-not (Test-Path $BrowserPath)) {
  throw "A built Chromium binary was not found at $BrowserPath. Run npm run chromium:build first."
}

$devToolsFrontend = Join-Path $paths.DevToolsRoot "out\$DevToolsTarget\gen\front_end"
if (-not (Test-Path $devToolsFrontend)) {
  throw "The customized DevTools frontend was not found at $devToolsFrontend. Run npm run chromium:devtools first."
}

$profile = Join-Path $paths.SourceRoot 'profiles\nexus-source'
New-Item -ItemType Directory -Force -Path $profile | Out-Null

$arguments = @(
  "--user-data-dir=$profile",
  "--custom-devtools-frontend=$devToolsFrontend",
  '--auto-open-devtools-for-tabs',
  '--remote-debugging-port=9333',
  $StartUrl
)
Start-Process -FilePath $BrowserPath -ArgumentList $arguments
