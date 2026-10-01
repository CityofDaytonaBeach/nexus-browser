[CmdletBinding()]
param([string]$Target = 'Default')

. (Join-Path $PSScriptRoot 'common.ps1')

$paths = Get-NexusSourcePaths
if (-not (Test-Path (Join-Path $paths.DevToolsRoot 'package.json'))) {
  throw 'DevTools source is missing. Run npm run chromium:bootstrap:devtools first.'
}

Set-NexusChromiumEnvironment
$gn = Join-Path $paths.DevToolsRoot 'buildtools\win\gn.exe'
$ninja = Join-Path $paths.DevToolsRoot 'third_party\ninja\ninja.exe'
if (-not (Test-Path $gn) -or -not (Test-Path $ninja)) {
  throw 'Pinned DevTools build tools are missing. Run npm run chromium:bootstrap:devtools first.'
}

Push-Location $paths.DevToolsRoot
try {
  Invoke-NexusNative $gn @('gen', "out\$Target")
  Invoke-NexusNative $ninja @('-C', "out\$Target", 'devtools_frontend_resources')
} finally {
  Pop-Location
}

Write-Host "Built the Nexus DevTools frontend in $($paths.DevToolsRoot)\out\$Target\gen\front_end."
