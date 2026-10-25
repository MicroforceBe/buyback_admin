$ErrorActionPreference = 'Stop'
$taskNode = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
if (-not (Test-Path -LiteralPath $taskNode)) { throw 'De bestaande Node-runtime ontbreekt. Er wordt niets geinstalleerd.' }
Write-Host 'Microforce USB TEST - alleen buyback-admin-test.vercel.app. Sluit dit venster om te stoppen.'
& $taskNode (Join-Path $PSScriptRoot 'server.mjs')
