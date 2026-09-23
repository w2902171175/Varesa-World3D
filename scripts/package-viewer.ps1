$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseRoot = Join-Path $projectRoot 'release'
$artifactBase = 'Varesa-World3D-rainy-corner-viewer-v1.0.0'
$readmeFiles = @(Get-ChildItem -LiteralPath $releaseRoot -File -Filter 'README-*.txt')
if ($readmeFiles.Count -ne 1) { throw 'Expected one viewer README in release directory.' }
$files = @(
    (Join-Path $releaseRoot ($artifactBase + '.html')),
    $readmeFiles[0].FullName,
    (Join-Path $releaseRoot 'THREE-LICENSE.txt'),
    (Join-Path $projectRoot 'LICENSE')
)
foreach ($file in $files) {
    $resolved = [IO.Path]::GetFullPath($file)
    if (-not $resolved.StartsWith($projectRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
        throw 'Release input missing or outside project: ' + $file
    }
}
$destination = Join-Path $releaseRoot ($artifactBase + '.zip')
Compress-Archive -LiteralPath $files -DestinationPath $destination -Force
Write-Output ('Packaged viewer release: ' + $destination)
