[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$setupRoot = Join-Path $repoRoot '.setup'
$vsInstaller = Join-Path $setupRoot 'vs_community.exe'
$sdkInstaller = Join-Path $setupRoot 'winsdksetup.exe'
$logPath = Join-Path $setupRoot 'install-windows-toolchain.log'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
  $arguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', "`"$PSCommandPath`""
  )
  Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs
  exit
}

New-Item -ItemType Directory -Force -Path $setupRoot | Out-Null
Start-Transcript -Path $logPath -Force
try {
  if (-not (Test-Path $vsInstaller) -or -not (Test-Path $sdkInstaller)) {
    throw "The verified Microsoft installers are missing from $setupRoot."
  }

  foreach ($installer in @($vsInstaller, $sdkInstaller)) {
    $signature = Get-AuthenticodeSignature -LiteralPath $installer
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') {
      throw "Authenticode verification failed for $installer."
    }
  }

  Write-Host 'Installing Visual Studio 2026 Community for Chromium...'
  $vsArguments = @(
    '--passive',
    '--wait',
    '--norestart',
    '--nocache',
    '--add', 'Microsoft.VisualStudio.Workload.NativeDesktop',
    '--add', 'Microsoft.VisualStudio.Component.VC.ATLMFC',
    '--add', 'Microsoft.VisualStudio.Component.Windows11SDK.28000',
    '--includeRecommended'
  )
  $vs = Start-Process -FilePath $vsInstaller -ArgumentList $vsArguments -Wait -PassThru
  if ($vs.ExitCode -notin @(0, 3010)) {
    throw "Visual Studio installer exited with code $($vs.ExitCode)."
  }

  Write-Host 'Installing Windows SDK 10.0.28000 and Debugging Tools...'
  $sdkArguments = @('/features', 'OptionId.WindowsDesktopDebuggers', '/quiet', '/norestart', '/ceip', 'off')
  $sdk = Start-Process -FilePath $sdkInstaller -ArgumentList $sdkArguments -Wait -PassThru
  if ($sdk.ExitCode -notin @(0, 3010)) {
    throw "Windows SDK installer exited with code $($sdk.ExitCode)."
  }

  Write-Host 'Toolchain installation finished. Running Chromium doctor...'
  & npm.cmd run chromium:doctor
  if ($LASTEXITCODE -ne 0) {
    throw "Chromium doctor exited with code $LASTEXITCODE."
  }
} finally {
  Stop-Transcript
}

Write-Host 'Chromium Windows toolchain installation complete.'
Read-Host 'Press Enter to close'
