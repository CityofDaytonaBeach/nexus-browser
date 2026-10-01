[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$setupRoot = Join-Path $repoRoot '.setup'
$installer = Join-Path $setupRoot 'winsdksetup.exe'
$transcriptPath = Join-Path $setupRoot 'install-windows-sdk.log'
$sdkLogPath = Join-Path $setupRoot 'windows-sdk-bootstrap.log'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', "`"$PSCommandPath`""
  )
  exit
}

New-Item -ItemType Directory -Force -Path $setupRoot | Out-Null
Start-Transcript -Path $transcriptPath -Force
try {
  if (-not (Test-Path $installer)) {
    throw "The Windows SDK installer is missing from $setupRoot."
  }
  $signature = Get-AuthenticodeSignature -LiteralPath $installer
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') {
    throw 'Authenticode verification failed for the Windows SDK installer.'
  }

  $vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
  $setup = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\setup.exe'
  if (-not (Test-Path $vswhere) -or -not (Test-Path $setup)) {
    throw 'Visual Studio Installer was not found.'
  }
  $installPath = (& $vswhere -latest -products '*' -version '[18.0,19.0)' -property installationPath).Trim()
  if ([string]::IsNullOrWhiteSpace($installPath)) {
    throw 'Visual Studio 2026 was not found.'
  }

  Write-Host 'Adding Windows SDK 10.0.28000 through Visual Studio Installer...'
  $vsArguments = @(
    'modify',
    '--installPath', "`"$installPath`"",
    '--add', 'Microsoft.VisualStudio.Component.Windows11SDK.28000',
    '--passive',
    '--norestart'
  )
  $vs = Start-Process -FilePath $setup -ArgumentList $vsArguments -Wait -PassThru
  if ($vs.ExitCode -notin @(0, 3010)) {
    throw "Visual Studio Installer exited with code $($vs.ExitCode)."
  }

  Write-Host 'Adding Windows Desktop Debuggers...'
  $arguments = @(
    '/features',
    'OptionId.WindowsDesktopDebuggers',
    '/quiet',
    '/norestart',
    '/ceip', 'off',
    '/log', "`"$sdkLogPath`""
  )
  $process = Start-Process -FilePath $installer -ArgumentList $arguments -Wait -PassThru
  if ($process.ExitCode -notin @(0, 3010)) {
    throw "Windows SDK installer exited with code $($process.ExitCode)."
  }

  $sdkInclude = 'C:\Program Files (x86)\Windows Kits\10\Include'
  $sdk = Get-ChildItem $sdkInclude -Directory -Filter '10.0.28000.*' -ErrorAction SilentlyContinue | Select-Object -First 1
  $debugger = 'C:\Program Files (x86)\Windows Kits\10\Debuggers\x64\cdb.exe'
  if (-not $sdk -or -not (Test-Path $debugger)) {
    throw 'The installer exited successfully, but the required SDK or x64 debugger is still missing.'
  }

  Write-Host "Installed Windows SDK $($sdk.Name) and Debugging Tools."
} finally {
  Stop-Transcript
}

Read-Host 'Press Enter to close'
