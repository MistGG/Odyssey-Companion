# Downloads Windows amd64 embeddable CPython, enables site-packages, installs pymem into resources/python-runtime.
# Run before electron-builder pack/release on Windows (requires network once per version bump).
$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
# Keep outside `resources/` so electron-builder’s `extraResources` copy of `resources/` never duplicates this tree.
$Dest = Join-Path $RepoRoot 'bundle\python-runtime'

# Bump when you want a newer security/runtime baseline (must match embed zip on python.org).
$PyVer = '3.12.7'
$ZipName = "python-$PyVer-embed-amd64.zip"
$ZipUrl = "https://www.python.org/ftp/python/$PyVer/$ZipName"

Write-Host "[prepare-embedded-python] Python $PyVer -> $Dest"

if (-not (Test-Path $Dest)) {
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
}

$ZipPath = Join-Path $env:TEMP "odyssey-$ZipName"
Write-Host "[prepare-embedded-python] Downloading $ZipUrl"
Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath -UseBasicParsing

Write-Host "[prepare-embedded-python] Extracting"
Expand-Archive -Path $ZipPath -DestinationPath $Dest -Force
Remove-Item $ZipPath -ErrorAction SilentlyContinue

# Enable site-packages / pip (embeddable ships with `#import site` commented).
$Pth = Get-ChildItem -LiteralPath $Dest -Filter 'python*._pth' -File | Select-Object -First 1
if (-not $Pth) {
  throw "Could not find python*._pth under embeddable extract."
}
$PthText = Get-Content -LiteralPath $Pth.FullName -Raw
$PthText = $PthText -replace '(?m)^#\s*import site\s*$', 'import site'
if ($PthText -notmatch '(?m)^import site\s*$') {
  $PthText = $PthText.TrimEnd() + "`r`nimport site`r`n"
}
Set-Content -LiteralPath $Pth.FullName -Value $PthText -NoNewline

$PyExe = Join-Path $Dest 'python.exe'
if (-not (Test-Path $PyExe)) {
  throw "python.exe missing after extract: $PyExe"
}

$GetPip = Join-Path $Dest 'get-pip.py'
Write-Host "[prepare-embedded-python] Fetching get-pip.py"
Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile $GetPip -UseBasicParsing

Push-Location $Dest
try {
  Write-Host "[prepare-embedded-python] Installing pip"
  & $PyExe $GetPip --no-warn-script-location 2>&1 | Write-Host
  Write-Host "[prepare-embedded-python] Installing pymem"
  & $PyExe -m pip install --disable-pip-version-check --no-warn-script-location 'pymem>=1.13.0' 2>&1 | Write-Host
}
finally {
  Pop-Location
}

Remove-Item $GetPip -ErrorAction SilentlyContinue

& $PyExe -c "import pymem; print('pymem OK')" 2>&1 | Write-Host

Write-Host "[prepare-embedded-python] Done. Bundled runtime at:`n  $Dest"
