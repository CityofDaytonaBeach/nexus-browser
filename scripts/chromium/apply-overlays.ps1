[CmdletBinding()]
param([string]$DevToolsRoot)

. (Join-Path $PSScriptRoot 'common.ps1')

$paths = Get-NexusSourcePaths
if ([string]::IsNullOrWhiteSpace($DevToolsRoot)) {
  $DevToolsRoot = $paths.DevToolsRoot
}
$DevToolsRoot = [IO.Path]::GetFullPath($DevToolsRoot)

$devToolsGit = Join-Path $DevToolsRoot '.git'
if (-not (Test-Path $devToolsGit)) {
  throw "DevTools source was not found at $DevToolsRoot. Run npm run chromium:bootstrap:devtools first."
}

function Add-AfterAnchor {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Anchor,
    [Parameter(Mandatory = $true)][string]$Insertion,
    [Parameter(Mandatory = $true)][string]$Needle
  )

  $text = [IO.File]::ReadAllText($Path)
  if ($text.Contains($Needle)) {
    return
  }
  if (-not $text.Contains($Anchor)) {
    throw "Upstream anchor was not found in $Path. Rebase the Nexus overlay for this revision."
  }
  $newLine = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
  $updated = $text.Replace($Anchor, "$Anchor$newLine$Insertion")
  [IO.File]::WriteAllText($Path, $updated, [Text.UTF8Encoding]::new($false))
}

$overlayRoot = Join-Path $paths.RepoRoot 'chromium-fork\overlays\devtools\front_end\panels\nexus'
$panelRoot = Join-Path $DevToolsRoot 'front_end\panels\nexus'
New-Item -ItemType Directory -Force -Path $panelRoot | Out-Null
Copy-Item (Join-Path $overlayRoot '*') $panelRoot -Recurse -Force

$appEntry = Join-Path $DevToolsRoot 'front_end\entrypoints\devtools_app\devtools_app.ts'
Add-AfterAnchor $appEntry `
  "import '../../panels/network/network-meta.js';" `
  "import '../../panels/nexus/nexus-meta.js';" `
  "../../panels/nexus/nexus-meta.js"

$appBuild = Join-Path $DevToolsRoot 'front_end\entrypoints\devtools_app\BUILD.gn'
Add-AfterAnchor $appBuild `
  '    "../../panels/mobile_throttling:meta",' `
  '    "../../panels/nexus:meta",' `
  '../../panels/nexus:meta'

$resourceList = Join-Path $DevToolsRoot 'config\gni\devtools_grd_files.gni'
Add-AfterAnchor $resourceList `
  '  "front_end/panels/mobile_throttling/mobile_throttling.js",' `
  "  `"front_end/panels/nexus/nexus-meta.js`",`r`n  `"front_end/panels/nexus/nexus.js`"," `
  'front_end/panels/nexus/nexus-meta.js'
Add-AfterAnchor $resourceList `
  '  "front_end/panels/mobile_throttling/throttlingSettingsTab.css.js",' `
  "  `"front_end/panels/nexus/NexusPanel.js`",`r`n  `"front_end/panels/nexus/nexusPanel.css.js`"," `
  'front_end/panels/nexus/NexusPanel.js'

Write-Host "Applied the Nexus DevTools source overlay to $DevToolsRoot."
