param(
  [Parameter(Mandatory = $true)][ValidateSet('launch', 'doctor', 'cleanup')][string]$Action,
  [Parameter(Mandatory = $true)][string]$EvidenceDir,
  [string]$BrowserPath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$evidence = [IO.Path]::GetFullPath($EvidenceDir)
$stateFile = Join-Path $evidence 'instance.json'
if ($Action -eq 'launch') {
  if (Test-Path -LiteralPath $stateFile) { throw 'Use a fresh evidence directory for each launch.' }
  $browser = (Resolve-Path -LiteralPath $BrowserPath).Path
  New-Item -ItemType Directory -Path $evidence -Force | Out-Null
  $profile = Join-Path ([IO.Path]::GetTempPath()) ('wordbloom-verify-' + [guid]::NewGuid())
  New-Item -ItemType Directory -Path (Join-Path $profile 'Default') -Force | Out-Null
  @{ download = @{ default_directory = $evidence; prompt_for_download = $false } } |
    ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $profile 'Default/Preferences') -Encoding UTF8
  $manifest = Get-Content -LiteralPath (Join-Path $repo 'manifest.json') -Raw | ConvertFrom-Json
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $hash = $sha.ComputeHash([Convert]::FromBase64String($manifest.key)) } finally { $sha.Dispose() }
  $extensionId = -join ($hash[0..15] | ForEach-Object {
    [string][char](97 + ($_ -shr 4)) + [string][char](97 + ($_ -band 15))
  })
  $url = "chrome-extension://$extensionId/popup.html"
  $process = Start-Process -FilePath $browser -ArgumentList @(
    "--user-data-dir=`"$profile`"", "--load-extension=`"$repo`"",
    '--no-first-run', '--no-default-browser-check', '--new-window', $url
  ) -PassThru -WindowStyle Hidden
  $state = [ordered]@{ repo = $repo; profile = $profile; browser = $browser;
    version = (Get-Item -LiteralPath $browser).VersionInfo.ProductVersion;
    processId = $process.Id; extensionId = $extensionId; popupUrl = $url;
    startedAt = (Get-Date).ToString('o'); cleaned = $false }
  $state | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
  $state | ConvertTo-Json
  exit
}
$state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$profilePath = [IO.Path]::GetFullPath($state.profile)
if (-not $profilePath.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path $profilePath -Leaf) -notmatch '^wordbloom-verify-[0-9a-f-]{36}$') {
  throw 'Profile is outside the owned temporary directory boundary.'
}
if ($state.repo -ne $repo) { throw 'State belongs to another checkout.' }
$owned = @(Get-CimInstance Win32_Process | Where-Object {
  $_.ExecutablePath -eq $state.browser -and $_.CommandLine -and
  $_.CommandLine.Contains($profilePath)
})
if ($Action -eq 'doctor') {
  if ($state.cleaned -or -not (Test-Path -LiteralPath $profilePath) -or -not $owned.Count) {
    throw 'Owned browser instance is not running.'
  }
  [ordered]@{ state = $state; ownedProcessIds = @($owned.ProcessId);
    manifestVersion = (Get-Content (Join-Path $repo 'manifest.json') -Raw | ConvertFrom-Json).version;
    next = 'Require the expected extension origin and rendered controls in the UI.' } |
    ConvertTo-Json -Depth 6
  exit
}
# Stop only processes carrying this run's unique profile path, never by image name.
foreach ($item in $owned) { Stop-Process -Id $item.ProcessId -ErrorAction SilentlyContinue }
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  try {
    if (Test-Path -LiteralPath $profilePath) { Remove-Item -LiteralPath $profilePath -Recurse -Force }
    break
  } catch {
    if ($attempt -eq 19) { throw }
    Start-Sleep -Milliseconds 250
  }
}
$state.cleaned = $true
$state | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
[ordered]@{ cleanedAt = (Get-Date).ToString('o'); profileRemoved = -not (Test-Path -LiteralPath $profilePath);
  remainingOwnedProcesses = @(Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -eq $state.browser -and $_.CommandLine -and $_.CommandLine.Contains($profilePath)
  }).Count; evidenceFiles = @(Get-ChildItem -LiteralPath $evidence -File | Select-Object -ExpandProperty Name) } |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'cleanup.json') -Encoding UTF8
Get-Content -LiteralPath (Join-Path $evidence 'cleanup.json')
