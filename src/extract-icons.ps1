# Extracts real icons (any index, up to 256px) from .exe / .dll / .ico files and saves them as PNGs.
# Input:  JSON file with [{ key, path, index }]      Output (stdout): JSON { key: "path-to.png" | null }
param([string]$ListFile, [string]$OutDir)
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class IconX {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern uint PrivateExtractIcons(string file, int index, int cx, int cy, IntPtr[] icons, int[] ids, uint count, uint flags);
  [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr handle);
}
"@

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$items = Get-Content -LiteralPath $ListFile -Raw -Encoding UTF8 | ConvertFrom-Json
$result = [ordered]@{}

foreach ($it in $items) {
  $file = [Environment]::ExpandEnvironmentVariables([string]$it.path)
  $png = Join-Path $OutDir ($it.key + '.png')
  if (Test-Path -LiteralPath $png) { $result[$it.key] = $png; continue }
  if (-not (Test-Path -LiteralPath $file)) { $result[$it.key] = $null; continue }

  $saved = $false
  foreach ($size in 256, 128, 64, 48, 32) {
    $handles = New-Object IntPtr[] 1
    $ids = New-Object int[] 1
    $count = [IconX]::PrivateExtractIcons($file, [int]$it.index, $size, $size, $handles, $ids, 1, 0)
    if ($count -ge 1 -and $handles[0] -ne [IntPtr]::Zero) {
      try {
        $icon = [System.Drawing.Icon]::FromHandle($handles[0])
        $bmp = $icon.ToBitmap()
        $bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        $saved = $true
      } catch {}
      [void][IconX]::DestroyIcon($handles[0])
      if ($saved) { break }
    }
  }
  if (-not $saved) {
    # Last resort: the icon Windows associates with the file
    try {
      $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($file)
      if ($icon) { $bmp = $icon.ToBitmap(); $bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose(); $saved = $true }
    } catch {}
  }
  $result[$it.key] = if ($saved) { $png } else { $null }
}
$result | ConvertTo-Json -Compress
