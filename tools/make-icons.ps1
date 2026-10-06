# Generates the app icons (a progress ring on pink) into icons/.
# Usage: powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'icons'
New-Item -ItemType Directory -Force $out | Out-Null

function Make-Icon([int]$size, [string]$file, [bool]$maskable) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $blue = [System.Drawing.ColorTranslator]::FromHtml('#ff8b94')
  $light = [System.Drawing.Color]::FromArgb(90, 255, 255, 255)

  if ($maskable) {
    $g.FillRectangle((New-Object System.Drawing.SolidBrush $blue), 0, 0, $size, $size)
    $content = $size * 0.62   # keep the ring inside the maskable safe zone
  } else {
    $r = $size * 0.22
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = 2 * $r
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
    $path.AddArc(0, $size - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.FillPath((New-Object System.Drawing.SolidBrush $blue), $path)
    $content = $size * 0.74
  }

  $stroke = $content * 0.16
  $ringSize = $content - $stroke
  $x = ($size - $ringSize) / 2
  $track = New-Object System.Drawing.Pen $light, $stroke
  $g.DrawEllipse($track, $x, $x, $ringSize, $ringSize)
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), $stroke
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
  $g.DrawArc($pen, $x, $x, $ringSize, $ringSize, -90, 250)
  $dot = $content * 0.16
  $g.FillEllipse([System.Drawing.Brushes]::White, ($size - $dot) / 2, ($size - $dot) / 2, $dot, $dot)

  $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Make-Icon 192 'icon-192.png' $false
Make-Icon 512 'icon-512.png' $false
Make-Icon 180 'icon-180.png' $true
Make-Icon 512 'icon-maskable-512.png' $true
Write-Host "Icons written to $out"
