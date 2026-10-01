[CmdletBinding()]
param([string]$Output = 'out\Nexus')

. (Join-Path $PSScriptRoot 'common.ps1')

$paths = Get-NexusSourcePaths
if (-not (Test-Path (Join-Path $paths.ChromiumRoot '.git'))) {
  throw 'Chromium source is missing. Run npm run chromium:bootstrap first.'
}

Set-NexusChromiumEnvironment
$outputPath = Join-Path $paths.ChromiumRoot $Output
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
Copy-Item (Join-Path $paths.RepoRoot 'chromium-fork\args\nexus-debug.gn') (Join-Path $outputPath 'args.gn') -Force

Push-Location $paths.ChromiumRoot
try {
  Invoke-NexusNative (Join-Path $paths.DepotToolsRoot 'gn.bat') @('gen', $Output)
  Invoke-NexusNative (Join-Path $paths.DepotToolsRoot 'autoninja.bat') @('-C', $Output, 'chrome')
} finally {
  Pop-Location
}

Write-Host "Built Nexus Chromium at $outputPath\chrome.exe."
