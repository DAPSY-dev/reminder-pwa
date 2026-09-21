Add-Type -AssemblyName System.Drawing
$iconDirectory = Join-Path $PSScriptRoot '..\public\icons'
New-Item -ItemType Directory -Force -Path $iconDirectory | Out-Null
foreach ($iconSize in @(192, 512)) {
  $bitmap = New-Object System.Drawing.Bitmap($iconSize, $iconSize)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#f472b6'))
  $scale = $iconSize / 192.0
  $graphics.ScaleTransform($scale, $scale)
  $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#29101f'), 8)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddBezier(132, 75, 132, 27, 60, 27, 60, 75)
  $path.AddBezier(60, 75, 60, 113, 42, 113, 42, 129)
  $path.AddLine(42, 129, 150, 129)
  $path.AddBezier(150, 129, 150, 113, 132, 113, 132, 75)
  $graphics.DrawPath($pen, $path)
  $graphics.DrawLine($pen, 84, 151, 108, 151)
  $bitmap.Save((Join-Path $iconDirectory "icon-$iconSize.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  if ($iconSize -eq 512) { $bitmap.Save((Join-Path $iconDirectory 'maskable-512.png'), [System.Drawing.Imaging.ImageFormat]::Png) }
  $path.Dispose()
  $pen.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}
