param(
  [Parameter(Mandatory = $true)]
  [string]$DownSource,

  [Parameter(Mandatory = $true)]
  [string]$UpSource,

  [string]$RuntimeDirectory = 'public/art/conquest-dongho/life',
  [string]$MasterDirectory = 'output/conquest-dongho-review/attempts/flying-egrets-2026-08-31'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$canvasWidth = 256
$canvasHeight = 160
$padding = 10

function New-TransparentEgretMaster {
  param([string]$SourcePath)

  $source = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $SourcePath))
  $master = New-Object System.Drawing.Bitmap(
    $source.Width,
    $source.Height,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )

  $minX = $source.Width
  $maxX = -1
  $minY = $source.Height
  $maxY = -1
  $anchorXTotal = 0.0
  $anchorYTotal = 0.0
  $anchorPixels = 0

  for ($y = 0; $y -lt $source.Height; $y += 1) {
    for ($x = 0; $x -lt $source.Width; $x += 1) {
      $colour = $source.GetPixel($x, $y)
      $maxChannel = [Math]::Max($colour.R, [Math]::Max($colour.G, $colour.B))
      $minChannel = [Math]::Min($colour.R, [Math]::Min($colour.G, $colour.B))

      # Image generation returned an opaque pale checkerboard. It is neutral grey; the bird's
      # cream paper and orange-brown ink are chromatic. Removing only bright neutral pixels keeps
      # the feather texture and the dark contour intact while producing a real alpha channel.
      $isCheckerboard = ($maxChannel - $minChannel) -le 12 -and $minChannel -ge 220
      if ($isCheckerboard) {
        $master.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
        continue
      }

      $master.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $colour.R, $colour.G, $colour.B))
      $minX = [Math]::Min($minX, $x)
      $maxX = [Math]::Max($maxX, $x)
      $minY = [Math]::Min($minY, $y)
      $maxY = [Math]::Max($maxY, $y)

      # The orange beak is the stable point shared by both poses. Aligning on it prevents the
      # bird's body from bobbing when only the wings are supposed to change.
      $isBeak = $x -ge [int]($source.Width * 0.62) `
        -and $colour.R -gt 100 `
        -and ($colour.R - $colour.G) -gt 25 `
        -and ($colour.G - $colour.B) -gt 15 `
        -and $colour.B -lt 145
      if ($isBeak) {
        $anchorXTotal += $x
        $anchorYTotal += $y
        $anchorPixels += 1
      }
    }
  }

  $source.Dispose()
  if ($maxX -lt $minX -or $maxY -lt $minY) {
    $master.Dispose()
    throw "No egret foreground found in $SourcePath"
  }
  if ($anchorPixels -eq 0) {
    $master.Dispose()
    throw "No beak anchor found in $SourcePath"
  }

  return [PSCustomObject]@{
    Bitmap = $master
    MinX = $minX
    MaxX = $maxX
    MinY = $minY
    MaxY = $maxY
    AnchorX = $anchorXTotal / $anchorPixels
    AnchorY = $anchorYTotal / $anchorPixels
  }
}

function Save-NormalizedEgret {
  param(
    [pscustomobject]$Egret,
    [double]$Scale,
    [double]$TargetAnchorX,
    [double]$TargetAnchorY,
    [string]$OutputPath
  )

  $canvas = New-Object System.Drawing.Bitmap(
    $canvasWidth,
    $canvasHeight,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

  $destination = New-Object System.Drawing.RectangleF(
    [single]($TargetAnchorX - $Egret.AnchorX * $Scale),
    [single]($TargetAnchorY - $Egret.AnchorY * $Scale),
    [single]($Egret.Bitmap.Width * $Scale),
    [single]($Egret.Bitmap.Height * $Scale)
  )
  $graphics.DrawImage($Egret.Bitmap, $destination)
  $graphics.Dispose()
  $canvas.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()
}

$down = New-TransparentEgretMaster -SourcePath $DownSource
$up = New-TransparentEgretMaster -SourcePath $UpSource

$minDx = [Math]::Min($down.MinX - $down.AnchorX, $up.MinX - $up.AnchorX)
$maxDx = [Math]::Max($down.MaxX - $down.AnchorX, $up.MaxX - $up.AnchorX)
$minDy = [Math]::Min($down.MinY - $down.AnchorY, $up.MinY - $up.AnchorY)
$maxDy = [Math]::Max($down.MaxY - $down.AnchorY, $up.MaxY - $up.AnchorY)
$scaleX = ($canvasWidth - 2 * $padding) / ($maxDx - $minDx)
$scaleY = ($canvasHeight - 2 * $padding) / ($maxDy - $minDy)
$scale = [Math]::Min($scaleX, $scaleY)
$targetAnchorX = ($canvasWidth - ($maxDx - $minDx) * $scale) / 2 - $minDx * $scale
$targetAnchorY = ($canvasHeight - ($maxDy - $minDy) * $scale) / 2 - $minDy * $scale

New-Item -ItemType Directory -Force -Path $RuntimeDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $MasterDirectory | Out-Null

$downMasterPath = Join-Path $MasterDirectory 'egret-down-master.png'
$upMasterPath = Join-Path $MasterDirectory 'egret-up-master.png'
$down.Bitmap.Save($downMasterPath, [System.Drawing.Imaging.ImageFormat]::Png)
$up.Bitmap.Save($upMasterPath, [System.Drawing.Imaging.ImageFormat]::Png)

$downRuntimePath = Join-Path $RuntimeDirectory 'egret-down.png'
$upRuntimePath = Join-Path $RuntimeDirectory 'egret-up.png'
Save-NormalizedEgret -Egret $down -Scale $scale -TargetAnchorX $targetAnchorX `
  -TargetAnchorY $targetAnchorY -OutputPath $downRuntimePath
Save-NormalizedEgret -Egret $up -Scale $scale -TargetAnchorX $targetAnchorX `
  -TargetAnchorY $targetAnchorY -OutputPath $upRuntimePath

$down.Bitmap.Dispose()
$up.Bitmap.Dispose()

Write-Output "Prepared matched flying egret frames at ${canvasWidth}x${canvasHeight}."
Write-Output ("Shared beak anchor: {0:N2},{1:N2}; shared scale: {2:N5}" -f $targetAnchorX, $targetAnchorY, $scale)
Write-Output "Runtime: $downRuntimePath"
Write-Output "Runtime: $upRuntimePath"
Write-Output "Masters: $MasterDirectory"
