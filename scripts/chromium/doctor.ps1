[CmdletBinding()]
param([switch]$Strict)

. (Join-Path $PSScriptRoot 'common.ps1')

$paths = Get-NexusSourcePaths
$checks = [System.Collections.Generic.List[object]]::new()

function Add-Check {
  param([string]$Name, [bool]$Ready, [string]$Details, [bool]$Required = $true)
  $checks.Add([PSCustomObject]@{
    Check = $Name
    Status = if ($Ready) { 'ready' } elseif ($Required) { 'missing' } else { 'optional' }
    Details = $Details
    Required = $Required
    Ready = $Ready
  })
}

$isWindowsX64 = [Environment]::Is64BitOperatingSystem -and $env:OS -eq 'Windows_NT'
Add-Check 'Windows x64' $isWindowsX64 ([System.Runtime.InteropServices.RuntimeInformation]::OSDescription)

$driveRoot = [IO.Path]::GetPathRoot($paths.RepoRoot)
$drive = [IO.DriveInfo]::new($driveRoot)
$freeGb = [Math]::Round($drive.AvailableFreeSpace / 1GB, 1)
Add-Check 'Free disk' ($freeGb -ge 100) "$freeGb GB available; Chromium requires at least 100 GB"

$git = Get-Command git -ErrorAction SilentlyContinue
Add-Check 'Git' ($null -ne $git) $(if ($git) { (& git --version) } else { 'git was not found' })

$node = Get-Command node -ErrorAction SilentlyContinue
Add-Check 'Node.js' ($null -ne $node) $(if ($node) { (& node --version) } else { 'node was not found' }) $false

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$visualStudioPath = ''
if (Test-Path $vswhere) {
  $visualStudioPath = (& $vswhere -latest -products * -version '[18.0,19.0)' -requires Microsoft.VisualStudio.Workload.NativeDesktop -property installationPath).Trim()
}
Add-Check 'Visual Studio 2026' (-not [string]::IsNullOrWhiteSpace($visualStudioPath)) $(if ($visualStudioPath) { $visualStudioPath } else { '18.0+ with Desktop development with C++ is required' })

$sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\Include'
$sdk = Get-ChildItem $sdkRoot -Directory -Filter '10.0.28000.*' -ErrorAction SilentlyContinue | Select-Object -First 1
Add-Check 'Windows 11 SDK' ($null -ne $sdk) $(if ($sdk) { $sdk.FullName } else { '10.0.28000.x SDK and debugging tools are required' })

Add-Check 'depot_tools checkout' (Test-Path (Join-Path $paths.DepotToolsRoot 'gclient.bat')) $paths.DepotToolsRoot $false
Add-Check 'DevTools source' (Test-Path (Join-Path $paths.DevToolsRoot '.git')) $paths.DevToolsRoot $false
Add-Check 'Chromium source' (Test-Path (Join-Path $paths.ChromiumRoot '.git')) $paths.ChromiumRoot $false

$checks | Select-Object Check, Status, Details | Format-Table -AutoSize -Wrap

$missingRequired = @($checks | Where-Object { $_.Required -and -not $_.Ready })
if ($Strict -and $missingRequired.Count -gt 0) {
  exit 1
}
