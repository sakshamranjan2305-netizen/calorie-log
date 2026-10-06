# One-off: builds data/packaged.json, the most-scanned packaged products from Open Food Facts
# (products sold in India first, then worldwide), so common brands work offline.
# Data: Open Food Facts contributors, ODbL. Uses the search.openfoodfacts.org API (takes ~3 minutes).
#
# Usage (from the project folder):  powershell -ExecutionPolicy Bypass -File tools\fetch-off.ps1
param([int]$IndiaPages = 40, [int]$WorldPages = 20)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$headers = @{ 'User-Agent' = 'CalorieLog/1.0 (personal meal logger; offline data build)' }
$fields = 'code,product_name,product_name_en,brands,nutriments,serving_quantity,serving_size'

function Num($v) {
  if ($null -eq $v) { return $null }
  try { $n = [double]$v } catch { return $null }
  if ([double]::IsNaN($n) -or $n -lt 0) { return $null }
  return $n
}

$foods = New-Object System.Collections.Generic.List[object]
$seenCodes = @{}
$seenNames = @{}
$rejected = 0

$jobs = @()
for ($p = 1; $p -le $IndiaPages; $p++) { $jobs += "q=countries_tags:%22en:india%22&page=$p" }
for ($p = 1; $p -le $WorldPages; $p++) { $jobs += "page=$p" }

foreach ($job in $jobs) {
  $url = "https://search.openfoodfacts.org/search?$job&sort_by=-unique_scans_n&page_size=100&fields=$fields"
  $res = $null
  for ($try = 1; $try -le 3 -and -not $res; $try++) {
    # Decode the bytes as UTF-8 explicitly (Windows PowerShell 5.1 would otherwise garble accents).
    try {
      $wc = New-Object Net.WebClient
      $wc.Headers.Add('User-Agent', $headers['User-Agent'])
      $res = [Text.Encoding]::UTF8.GetString($wc.DownloadData($url)) | ConvertFrom-Json
    }
    catch { Write-Host "  retry ($($_.Exception.Message))"; Start-Sleep -Seconds 20 }
  }
  if (-not $res) { Write-Host "Skipped $job"; continue }

  foreach ($p in $res.hits) {
    if (-not $p.code -or $seenCodes.ContainsKey($p.code)) { continue }
    $seenCodes[$p.code] = 1
    $n = $p.nutriments
    if (-not $n) { $rejected++; continue }
    $kcal = Num $n.'energy-kcal_100g'
    if ($null -eq $kcal -and $null -ne (Num $n.energy_100g)) { $kcal = (Num $n.energy_100g) / 4.184 }
    $protein = Num $n.proteins_100g; $carbs = Num $n.carbohydrates_100g; $fat = Num $n.fat_100g
    $fibre = Num $n.fiber_100g
    $name = "$($p.product_name)".Trim()
    if (-not $name) { $name = "$($p.product_name_en)".Trim() }
    if ($null -eq $kcal -or $null -eq $protein -or $null -eq $carbs -or $null -eq $fat -or -not $name) { $rejected++; continue }

    # Sanity check: energy should roughly match 4/4/9 kcal per g of protein/carbs/fat (catches kJ typed as kcal, etc.)
    $expected = 4 * $protein + 4 * $carbs + 9 * $fat + 2 * ([double]$fibre)
    if ($kcal -gt 900 -or $protein + $carbs + $fat -gt 105 -or [Math]::Abs($kcal - $expected) -gt [Math]::Max(25, 0.2 * $kcal)) { $rejected++; continue }

    $brand = if ($p.brands -is [array]) { "$($p.brands[0])".Trim() } else { ("$($p.brands)" -split ',')[0].Trim() }
    if ($brand -and $name.ToLower().IndexOf($brand.ToLower()) -lt 0) { $name = "$brand $name" }
    $key = ($name.ToLower() -replace '[^a-z0-9]+', ' ').Trim()
    if ($seenNames.ContainsKey($key)) { continue }   # keep the most-scanned version of each product
    $seenNames[$key] = 1

    $portions = @()
    $grams = Num $p.serving_quantity
    if ($grams -gt 0 -and $grams -lt 2000) {
      $label = ("$($p.serving_size)" -replace '\(.*?\)', '' -replace '\s+', ' ').Trim()
      if (-not $label -or $label -match '^\d+([.,]\d+)?\s*(g|ml|gm|gram)s?$' -or $label.Length -gt 30) { $label = 'serving' }
      if ($label -match '^1 (.+)$') { $label = $Matches[1] }
      $portions = @(, [object[]]@($label, [Math]::Round($grams, 1)))
    }
    $r1 = { param($x) if ($null -eq $x) { 0 } else { [Math]::Round($x, 1) } }
    $foods.Add([object[]]@("$($p.code)", $name, (& $r1 $kcal), (& $r1 $protein), (& $r1 $carbs), (& $r1 $fat), (& $r1 $fibre), [object[]]$portions))
  }
  Write-Host "$job -> $($foods.Count) kept, $rejected rejected"
  Start-Sleep -Seconds 2   # be gentle with the free API
}

$out = [ordered]@{
  source  = 'Open Food Facts (most-scanned products sold in India, plus worldwide)'
  license = 'ODbL (database), DbCL (contents)'
  built   = (Get-Date).ToString('yyyy-MM-dd')
  fields  = @('code', 'name', 'kcal', 'protein', 'carbs', 'fat', 'fibre', 'portions')
  note    = 'Nutrients are per 100 g (or 100 ml); portions are [label, grams]'
  foods   = $foods
}
$json = ConvertTo-Json $out -Compress -Depth 6
$dest = Join-Path $root 'data\packaged.json'
[IO.File]::WriteAllText($dest, $json, (New-Object Text.UTF8Encoding $false))
Write-Host "Wrote $($foods.Count) products to $dest ($([Math]::Round($json.Length / 1KB)) KB)"
