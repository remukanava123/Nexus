# Lists Start menu entries for Microsoft Store (packaged) apps with the path to their best logo image.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$packages = @{}
Get-AppxPackage | ForEach-Object { $packages[$_.PackageFamilyName] = $_ }

$result = foreach ($app in (Get-StartApps | Where-Object { $_.AppID -like '*!*' })) {
  $family, $appId = $app.AppID -split '!', 2
  $logo = $null
  $pkg = $packages[$family]
  if ($pkg) {
    try {
      [xml]$manifest = Get-Content (Join-Path $pkg.InstallLocation 'AppxManifest.xml') -Raw
      $entry = $manifest.Package.Applications.Application | Where-Object { $_.Id -eq $appId } | Select-Object -First 1
      $visual = $entry.ChildNodes | Where-Object { $_.LocalName -eq 'VisualElements' } | Select-Object -First 1
      $rel = $visual.Square44x44Logo
      if ($rel) {
        $base = Join-Path $pkg.InstallLocation $rel
        $dir = Split-Path $base
        $stem = [IO.Path]::GetFileNameWithoutExtension($base)
        $ext = [IO.Path]::GetExtension($base)
        $best = Get-ChildItem -LiteralPath $dir -Filter "$stem*$ext" -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -notmatch 'contrast|_light' } |
          Sort-Object {
            $n = $_.Name; $s = 0
            if ($n -match 'altform-unplated') { $s += 100 }
            if ($n -match 'targetsize-(\d+)') { $size = [int]$Matches[1]; $s += 50 - [Math]::Abs($size - 64) / 4 }
            elseif ($n -match 'scale-(\d+)') { $s += 20 + [int]$Matches[1] / 20 }
            -$s
          } | Select-Object -First 1
        if ($best) { $logo = $best.FullName } elseif (Test-Path -LiteralPath $base) { $logo = $base }
      }
    } catch {}
  }
  [pscustomobject]@{ Name = $app.Name; AppID = $app.AppID; Logo = $logo }
}
$result | ConvertTo-Json -Compress
