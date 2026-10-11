$node = "C:\Users\paulo\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.20.0-win-x64"
if (Test-Path $node) { $env:Path = "$node;" + $env:Path }
$destino = "C:\Users\paulo\controle-conformidade"
New-Item -ItemType Directory -Force -Path $destino | Out-Null
robocopy $PSScriptRoot $destino /E /XD node_modules dist /NFL /NDL /NJH /NJS | Out-Null
Set-Location $destino
if (-not (Test-Path ".\node_modules")) { npm install }
npm run dev
