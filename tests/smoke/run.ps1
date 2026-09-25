# Ejecuta la verificación de escritorio (Electron) de Programación y Fixture.
#   powershell -ExecutionPolicy Bypass -File tests\smoke\run.ps1
# Usa un binario de Electron para Windows: lo toma de node_modules si existe o
# lo desempaca desde la caché de electron-builder (%LOCALAPPDATA%\electron\Cache).
param(
    [int]$TimeoutMs = 180000,
    [string]$OutputJson = ''
)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$work = Join-Path $env:LOCALAPPDATA 'n3com-smoke'
$electron = Join-Path $work 'electron\electron.exe'

if (-not (Test-Path $electron)) {
    $bundled = Join-Path $root 'node_modules\electron\dist\electron.exe'
    $zip = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'electron\Cache') -Recurse -Filter 'electron-*-win32-x64.zip' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (Test-Path $bundled) {
        $electron = $bundled
    } elseif ($zip) {
        Write-Output "Desempacando Electron desde $($zip.Name)..."
        Expand-Archive -Path $zip.FullName -DestinationPath (Join-Path $work 'electron') -Force
    } else {
        Write-Error 'No se encontró un binario de Electron para Windows. Ejecutá `npm run pack` o instalá electron en node_modules.'
    }
}

$outLog = Join-Path $work 'smoke-out.log'
$errLog = Join-Path $work 'smoke-err.log'
Remove-Item $outLog, $errLog -ErrorAction SilentlyContinue
$process = Start-Process -FilePath $electron -ArgumentList (Join-Path $PSScriptRoot 'app') -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru -NoNewWindow
$finished = $process.WaitForExit($TimeoutMs)
if (-not $finished) { $process.Kill(); Write-Error 'La verificación no terminó dentro del tiempo máximo.' }

Get-Content $errLog -ErrorAction SilentlyContinue | ForEach-Object { Write-Output $_ }
$raw = Get-Content $outLog -Raw -ErrorAction SilentlyContinue
if (-not $raw) { Write-Error 'La verificación no produjo resultados.' }
if ($OutputJson) { Set-Content -LiteralPath $OutputJson -Value $raw -Encoding UTF8 }
$result = $raw | ConvertFrom-Json
$result.checks | ForEach-Object { Write-Output ("[{0}] {1}" -f $(if ($_.ok) { 'OK' } else { 'FALLA' }), $_.label) }
$failed = @($result.checks | Where-Object { -not $_.ok })
Write-Output ("Total: {0} comprobaciones, {1} fallas" -f @($result.checks).Count, $failed.Count)
if ($failed.Count) { exit 1 }
exit 0
