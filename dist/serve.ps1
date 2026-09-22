# Serve the Infinite Scroll Zoom demo over http://localhost:8787
# (ES Modules require http; file:// blocks them with CORS)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$prefix = "http://localhost:8787/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Infinite Scroll Zoom demo → $prefix  (Ctrl+C to stop)"
$mime = @{
  ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"
  ".mjs" = "text/javascript; charset=utf-8"; ".css" = "text/css; charset=utf-8"
  ".png" = "image/png"; ".jpg" = "image/jpeg"; ".svg" = "image/svg+xml"
  ".json" = "application/json"; ".mp4" = "video/mp4"
}
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart("/")
    if ($rel -eq "") { $rel = "index.html" }
    $file = Join-Path $root ($rel -replace "/", "\")
    if (-not (Test-Path $file -PathType Leaf) -or -not ((Resolve-Path $file).Path.StartsWith($root))) {
      $ctx.Response.StatusCode = 404
      $bytes = [Text.Encoding]::UTF8.GetBytes("404 not found")
    } else {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
      $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
    }
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.OutputStream.Close()
  }
} finally { $listener.Stop() }
