# One-off: builds data/basics.json (plain foods such as fruit, milk, nuts, raw dals and vegetables)
# from USDA FoodData Central SR Legacy, which is public domain (CC0).
# The food list, display names and serving sizes live in tools/basics.csv; nutrients come from USDA.
#
# Usage (from the project folder):  powershell -ExecutionPolicy Bypass -File tools\convert-basics.ps1
param(
  [string]$Url = 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$inv = [Globalization.CultureInfo]::InvariantCulture
# USDA nutrient ids: energy (kcal), protein, carbohydrate (by difference), total fat, total dietary fibre
$nutrientIds = @{ '1008' = 'kcal'; '1003' = 'protein'; '1005' = 'carbs'; '1004' = 'fat'; '1079' = 'fibre' }

$list = Import-Csv (Join-Path $PSScriptRoot 'basics.csv')
$values = @{}
foreach ($row in $list) { $values[$row.fdc_id] = @{} }

$tmp = Join-Path ([IO.Path]::GetTempPath()) ('usda_' + [guid]::NewGuid().ToString('N') + '.zip')
try {
  Write-Host "Downloading $Url"
  Invoke-WebRequest -UseBasicParsing $Url -OutFile $tmp
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($tmp)
  try {
    $entry = $zip.Entries | Where-Object { $_.Name -eq 'food_nutrient.csv' } | Select-Object -First 1
    $reader = New-Object IO.StreamReader($entry.Open())
    try {
      $null = $reader.ReadLine() # header: id, fdc_id, nutrient_id, amount, ...
      while ($null -ne ($line = $reader.ReadLine())) {
        $cols = $line.Split(',')
        $fdc = $cols[1].Trim('"')
        if (-not $values.ContainsKey($fdc)) { continue }
        $key = $nutrientIds[$cols[2].Trim('"')]
        if ($key) { $values[$fdc][$key] = [double]::Parse($cols[3].Trim('"'), $inv) }
      }
    } finally { $reader.Dispose() }
  } finally { $zip.Dispose() }
}
finally {
  Remove-Item -Force $tmp -ErrorAction SilentlyContinue
}

$foods = New-Object System.Collections.Generic.List[object]
foreach ($row in $list) {
  $v = $values[$row.fdc_id]
  if (-not $v.ContainsKey('kcal')) { throw "No energy value found for USDA food $($row.fdc_id) ($($row.name))" }
  $n = { param($k) if ($v.ContainsKey($k)) { [Math]::Round($v[$k], 1) } else { 0 } }
  $grams = [double]::Parse($row.serving_grams, $inv)
  $foods.Add(@(
    $row.fdc_id, $row.name,
    (& $n 'kcal'), (& $n 'protein'), (& $n 'carbs'), (& $n 'fat'), (& $n 'fibre'),
    $(if ($grams -gt 0) { $row.serving_label } else { '' }), $grams
  ))
}

$out = [ordered]@{
  source  = 'USDA FoodData Central, SR Legacy (April 2018)'
  license = 'Public domain (CC0)'
  fields  = @('code', 'name', 'kcal', 'protein', 'carbs', 'fat', 'fibre', 'servingUnit', 'servingGrams')
  note    = 'Nutrients are per 100 g; servingGrams is the weight of one servingUnit'
  foods   = $foods
}
$json = ConvertTo-Json $out -Compress -Depth 5
$dest = Join-Path $root 'data\basics.json'
New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
[IO.File]::WriteAllText($dest, $json, (New-Object Text.UTF8Encoding $false))
Write-Host "Wrote $($foods.Count) foods to $dest ($([Math]::Round($json.Length / 1KB)) KB)"
