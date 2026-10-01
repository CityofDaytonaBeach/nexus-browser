Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:NexusRepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:NexusSourceRoot = Join-Path $script:NexusRepoRoot '.chromium-source'
$script:NexusDepotToolsRoot = Join-Path $script:NexusSourceRoot 'depot_tools'
$script:NexusDevToolsRoot = Join-Path $script:NexusSourceRoot 'devtools-frontend'
$script:NexusChromiumCheckoutRoot = Join-Path $script:NexusSourceRoot 'chromium-checkout'
$script:NexusChromiumRoot = Join-Path $script:NexusChromiumCheckoutRoot 'src'

function Get-NexusSourcePaths {
  [PSCustomObject]@{
    RepoRoot = $script:NexusRepoRoot
    SourceRoot = $script:NexusSourceRoot
    DepotToolsRoot = $script:NexusDepotToolsRoot
    DevToolsRoot = $script:NexusDevToolsRoot
    ChromiumCheckoutRoot = $script:NexusChromiumCheckoutRoot
    ChromiumRoot = $script:NexusChromiumRoot
  }
}

function Set-NexusChromiumEnvironment {
  $pathEntries = @($script:NexusDepotToolsRoot)
  $nestedDepotTools = Join-Path $script:NexusDevToolsRoot 'third_party\depot_tools'
  if (Test-Path $nestedDepotTools) {
    $pathEntries += $nestedDepotTools
  }

  $env:PATH = (($pathEntries + @($env:PATH)) -join ';')
  $env:VPYTHON_VIRTUALENV_ROOT = Join-Path $script:NexusSourceRoot 'vpython'
  $env:DEPOT_TOOLS_WIN_TOOLCHAIN = '0'
  $env:GIT_CONFIG_COUNT = '1'
  $env:GIT_CONFIG_KEY_0 = 'http.sslBackend'
  $env:GIT_CONFIG_VALUE_0 = 'openssl'
}

function Invoke-NexusNative {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter()][string[]]$Arguments = @()
  )

  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Executable exited with code $LASTEXITCODE."
  }
}
