param([Parameter(Mandatory = $true)][string]$EvidenceDir)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$evidence = [IO.Path]::GetFullPath($EvidenceDir)
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
Push-Location $repo
try {
  $tests = Get-ChildItem -LiteralPath (Join-Path $repo 'tests') -Filter '*.test.cjs' |
    Select-Object -ExpandProperty FullName
  & node --test @tests 2>&1 | Tee-Object -FilePath (Join-Path $evidence 'tests.txt')
  $testExit = $LASTEXITCODE
  $syntax = @(foreach ($file in Get-ChildItem -LiteralPath $repo -Filter '*.js') {
    $output = & node --check $file.FullName 2>&1
    [ordered]@{ file = $file.Name; exitCode = $LASTEXITCODE; output = ($output -join "`n") }
  })
  $syntax | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'syntax.json') -Encoding UTF8
  $sourceFiles = @('manifest.json', 'AGENTS.md') +
    @(Get-ChildItem -LiteralPath $repo -File | Where-Object { $_.Extension -in '.js', '.html', '.css' } |
      Select-Object -ExpandProperty Name) +
    @($tests | ForEach-Object { 'tests/' + (Split-Path $_ -Leaf) })
  $hashes = @(foreach ($relative in $sourceFiles) {
    [ordered]@{ file = $relative; sha256 = (Get-FileHash -LiteralPath (Join-Path $repo $relative) -Algorithm SHA256).Hash }
  })
  [ordered]@{ capturedAt = (Get-Date).ToString('o'); node = (& node --version);
    commit = (& git rev-parse HEAD); testExitCode = $testExit;
    syntaxPassed = @($syntax | Where-Object { $_.exitCode -ne 0 }).Count -eq 0;
    sources = $hashes } | ConvertTo-Json -Depth 5 |
    Set-Content -LiteralPath (Join-Path $evidence 'baseline.json') -Encoding UTF8
  if ($testExit -ne 0 -or @($syntax | Where-Object { $_.exitCode -ne 0 }).Count) {
    throw 'Baseline failed; inspect the evidence before driving the UI.'
  }
} finally { Pop-Location }
