Add-Type -AssemblyName System.Drawing
$reviewRoot = $PSScriptRoot
$reviewIds = @('a-charge', 'b-formations', 'c-river-ambush')
$reviewLabels = @('A - Cavalry charge', 'B - Formation clash', 'C - River ambush')
$reviewBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#29261f'))
$reviewFont = [System.Drawing.Font]::new('Segoe UI', 16, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$smallFont = [System.Drawing.Font]::new('Segoe UI', 12, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$sheet = [System.Drawing.Bitmap]::new(1020, 462)
$sheetGraphics = [System.Drawing.Graphics]::FromImage($sheet)
$sheetGraphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#f7f5ef'))
for ($column = 0; $column -lt 3; $column++) {
  $id = $reviewIds[$column]
  $source = [System.Drawing.Image]::FromFile((Join-Path $reviewRoot "$id-master.png"))
  foreach ($size in @(256, 64, 48, 32)) {
    $thumb = [System.Drawing.Bitmap]::new($size, $size)
    $draw = [System.Drawing.Graphics]::FromImage($thumb)
    $draw.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $draw.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $draw.DrawImage($source, [System.Drawing.Rectangle]::new(0, 0, $size, $size))
    $thumb.Save((Join-Path $reviewRoot "$id-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $draw.Dispose()
    $thumb.Dispose()
  }
  $source.Dispose()
  $columnX = 30 + $column * 340
  $sheetGraphics.DrawString($reviewLabels[$column], $reviewFont, $reviewBrush, $columnX, 18)
  $large = [System.Drawing.Image]::FromFile((Join-Path $reviewRoot "$id-256.png"))
  $sheetGraphics.DrawImageUnscaled($large, $columnX, 50)
  $large.Dispose()
  $nextX = $columnX
  foreach ($size in @(64, 48, 32)) {
    $thumb = [System.Drawing.Image]::FromFile((Join-Path $reviewRoot "$id-$size.png"))
    $sheetGraphics.DrawImageUnscaled($thumb, $nextX, 346)
    $sheetGraphics.DrawString("$size px", $smallFont, $reviewBrush, $nextX, 418)
    $thumb.Dispose()
    $nextX += 94
  }
}
$sheet.Save((Join-Path $reviewRoot 'comparison.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$sheetGraphics.Dispose()
$sheet.Dispose()
$reviewFont.Dispose()
$smallFont.Dispose()
$reviewBrush.Dispose()
Write-Output 'Wrote three size sets and comparison.png'

$final = [System.Drawing.Image]::FromFile((Join-Path $reviewRoot 'final-1024.png'))
$adaptive = [System.Drawing.Image]::FromFile((Join-Path $reviewRoot 'adaptive-1024.png'))
foreach ($size in @(256, 64, 48, 32)) {
  $thumb = [System.Drawing.Bitmap]::new($size, $size)
  $draw = [System.Drawing.Graphics]::FromImage($thumb)
  $draw.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $draw.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $draw.DrawImage($final, [System.Drawing.Rectangle]::new(0, 0, $size, $size))
  $thumb.Save((Join-Path $reviewRoot "final-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $draw.Dispose()
  $thumb.Dispose()
}
$sheet = [System.Drawing.Bitmap]::new(1080, 460)
$draw = [System.Drawing.Graphics]::FromImage($sheet)
$draw.Clear([System.Drawing.ColorTranslator]::FromHtml('#f7f5ef'))
$draw.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$draw.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$draw.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$font = [System.Drawing.Font]::new('Segoe UI', 16, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$small = [System.Drawing.Font]::new('Segoe UI', 12, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#29261f'))
$draw.DrawString('First concept', $font, $brush, 24, 16)
$before = [System.Drawing.Image]::FromFile((Join-Path $reviewRoot 'b-formations-256.png'))
$draw.DrawImageUnscaled($before, 24, 50)
$before.Dispose()
$draw.DrawString('Refined: attack meets defense', $font, $brush, 322, 16)
$large = [System.Drawing.Image]::FromFile((Join-Path $reviewRoot 'final-256.png'))
$draw.DrawImageUnscaled($large, 322, 50)
$large.Dispose()
$draw.DrawString('Rounded preview', $font, $brush, 628, 16)
$round = [System.Drawing.Drawing2D.GraphicsPath]::new()
$round.AddArc(628, 60, 64, 64, 180, 90)
$round.AddArc(724, 60, 64, 64, 270, 90)
$round.AddArc(724, 156, 64, 64, 0, 90)
$round.AddArc(628, 156, 64, 64, 90, 90)
$round.CloseFigure()
$draw.SetClip($round)
$draw.DrawImage($final, [System.Drawing.Rectangle]::new(628, 60, 160, 160))
$draw.ResetClip()
$round.Dispose()
$draw.DrawString('Android circle', $font, $brush, 854, 16)
$circle = [System.Drawing.Drawing2D.GraphicsPath]::new()
$circle.AddEllipse(854, 60, 160, 160)
$draw.SetClip($circle)
$viewSize = [single](1024 * 72 / 108)
$viewInset = [single]((1024 - $viewSize) / 2)
$draw.DrawImage($adaptive, [System.Drawing.RectangleF]::new(854, 60, 160, 160), [System.Drawing.RectangleF]::new($viewInset, $viewInset, $viewSize, $viewSize), [System.Drawing.GraphicsUnit]::Pixel)
$draw.ResetClip()
$circle.Dispose()
$draw.DrawString('Phone-size checks', $font, $brush, 322, 334)
$nextX = 322
foreach ($size in @(64, 48, 32)) {
  $thumb = [System.Drawing.Image]::FromFile((Join-Path $reviewRoot "final-$size.png"))
  $draw.DrawImageUnscaled($thumb, $nextX, 366)
  $draw.DrawString("$size px", $small, $brush, $nextX + $size + 6, 380)
  $thumb.Dispose()
  $nextX += 144
}
$draw.DrawString('One clash. Two sides. Larger shapes.', $small, $brush, 628, 258)
$draw.DrawString('Preview masks; no physical-device test.', $small, $brush, 628, 278)
$sheet.Save((Join-Path $reviewRoot 'refinement-and-mobile.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$draw.Dispose()
$sheet.Dispose()
$font.Dispose()
$small.Dispose()
$brush.Dispose()
$final.Dispose()
$adaptive.Dispose()
Write-Output 'Wrote final size set and refinement-and-mobile.png'
