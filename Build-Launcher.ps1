[CmdletBinding()]
param([string]$OutputDirectory = $PSScriptRoot)

$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The Windows .NET Framework compiler was not found.' }

$source = Join-Path $PSScriptRoot 'Launcher.cs'
$script = Join-Path $PSScriptRoot 'Launch-Outline.ps1'
$output = [IO.Path]::GetFullPath($OutputDirectory)
[void][IO.Directory]::CreateDirectory($output)
foreach ($name in 'CodexChatOutline.exe', 'Stop-CodexChatOutline.exe') {
    $options = @('/nologo', '/codepage:65001', '/target:winexe', '/optimize+', '/platform:anycpu',
        '/reference:System.Windows.Forms.dll', "/resource:$script,Launch-Outline.ps1", "/out:$(Join-Path $output $name)")
    if ($name.StartsWith('Stop-')) { $options += '/define:STOP_LAUNCHER' }
    & $compiler @options $source
    if ($LASTEXITCODE -ne 0) { throw "Could not build $name." }
}
