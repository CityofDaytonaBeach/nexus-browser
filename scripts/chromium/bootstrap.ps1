[CmdletBinding()]
param(
  [ValidateSet('DevTools', 'Chromium', 'All')][string]$Target = 'DevTools',
  [switch]$WithHistory
)

. (Join-Path $PSScriptRoot 'common.ps1')

$paths = Get-NexusSourcePaths
$manifest = Get-Content (Join-Path $paths.RepoRoot 'chromium-fork\fork-manifest.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $paths.SourceRoot | Out-Null

function Set-PinnedRevision {
  param(
    [Parameter(Mandatory = $true)][string]$Repository,
    [Parameter(Mandatory = $true)][string]$Revision,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $currentRevision = (& git -C $Repository rev-parse HEAD).Trim()
  if ($currentRevision -eq $Revision) {
    return
  }

  $changes = (& git -C $Repository status --porcelain)
  if ($changes) {
    throw "$Label has local changes and cannot move from $currentRevision to $Revision. Preserve or discard those changes explicitly, then rerun bootstrap."
  }

  Invoke-NexusNative git @('-C', $Repository, '-c', 'http.sslBackend=openssl', 'fetch', '--depth', '1', 'origin', $Revision)
  Invoke-NexusNative git @('-C', $Repository, 'checkout', '--detach', $Revision)
}

if (-not (Test-Path (Join-Path $paths.DepotToolsRoot '.git'))) {
  Invoke-NexusNative git @(
    '-c', 'http.sslBackend=openssl', 'clone', '--depth', '1',
    'https://chromium.googlesource.com/chromium/tools/depot_tools.git',
    $paths.DepotToolsRoot
  )
}
Set-PinnedRevision $paths.DepotToolsRoot ([string]$manifest.upstream.depotTools.revision) 'depot_tools'

Invoke-NexusNative git @('-C', $paths.DepotToolsRoot, 'config', 'http.sslBackend', 'openssl')
Set-NexusChromiumEnvironment

$historyFlag = if ($WithHistory) { @() } else { @('--no-history') }

if ($Target -in @('DevTools', 'All')) {
  if (-not (Test-Path (Join-Path $paths.DevToolsRoot '.git'))) {
    Push-Location $paths.SourceRoot
    try {
      Invoke-NexusNative (Join-Path $paths.DepotToolsRoot 'fetch.bat') ($historyFlag + @('devtools-frontend'))
    } finally {
      Pop-Location
    }
  }

  Set-PinnedRevision $paths.DevToolsRoot ([string]$manifest.upstream.devtoolsFrontend.revision) 'DevTools frontend'
  Push-Location $paths.SourceRoot
  try {
    Invoke-NexusNative (Join-Path $paths.DepotToolsRoot 'gclient.bat') (@('sync') + $historyFlag)
  } finally {
    Pop-Location
  }
}

if ($Target -in @('Chromium', 'All')) {
  New-Item -ItemType Directory -Force -Path $paths.ChromiumCheckoutRoot | Out-Null
  if (-not (Test-Path (Join-Path $paths.ChromiumRoot '.git'))) {
    Push-Location $paths.ChromiumCheckoutRoot
    try {
      Invoke-NexusNative (Join-Path $paths.DepotToolsRoot 'fetch.bat') ($historyFlag + @('--force', 'chromium'))
    } finally {
      Pop-Location
    }
  } else {
    Push-Location $paths.ChromiumCheckoutRoot
    try {
      Invoke-NexusNative (Join-Path $paths.DepotToolsRoot 'gclient.bat') (@('sync') + $historyFlag)
    } finally {
      Pop-Location
    }
  }
}

Write-Host "Source bootstrap complete for $Target."
