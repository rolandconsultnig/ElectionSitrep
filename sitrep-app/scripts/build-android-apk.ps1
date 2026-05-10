<#
  Builds the Capacitor Android debug APK using your installed JDK and Gradle.
  Override paths: -JavaHome '...' -GradleBin '...'

  If the build fails with "SDK location not found", set ANDROID_HOME to your Android SDK
  (e.g. $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk") or create android/local.properties:
  sdk.dir=C\:\\Users\\You\\AppData\\Local\\Android\\Sdk
#>
param(
  [string]$JavaHome = 'C:\Program Files\Java\jdk-21',
  [string]$GradleBin = 'C:\gradle-9.3.1\bin'
)

$ErrorActionPreference = 'Stop'
$AppRoot = Split-Path $PSScriptRoot -Parent

if (-not (Test-Path (Join-Path $JavaHome 'bin\java.exe'))) {
  Write-Error "JDK not found at: $JavaHome"
}
if ($GradleBin -and -not (Test-Path (Join-Path $GradleBin 'gradle.bat'))) {
  Write-Warning "Optional: gradle.bat not found at $GradleBin — `gradlew.bat` may still work if JAVA_HOME is correct."
}

$env:JAVA_HOME = $JavaHome
$env:PATH = "$GradleBin;$JavaHome\bin;$env:PATH"

Write-Host "JAVA_HOME=$env:JAVA_HOME"
Write-Host "Using gradle from: $GradleBin"

Set-Location $AppRoot
npm run cap:sync
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Set-Location (Join-Path $AppRoot 'android')
.\gradlew.bat assembleDebug
exit $LASTEXITCODE
