# One-off: builds data/global.json, the worldwide generic food list, from two USDA FoodData Central
# datasets (public domain, CC0):
#   - FNDDS (Survey foods): ~5,400 foods "as eaten" (pizza, pasta, sushi, cereals, sandwiches...)
#   - SR Legacy: ingredients, cereals, snacks, sweets, fish, dairy... (minus baby food and raw meat cuts)
# Each food keeps up to 4 USDA portion sizes (e.g. "1 slice", "1 cup").
#
# Usage (from the project folder):  powershell -ExecutionPolicy Bypass -File tools\convert-usda.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$inv = [Globalization.CultureInfo]::InvariantCulture
# SR Legacy's food_nutrient.csv uses nutrient ids; FNDDS uses the older nutrient numbers.
$nutrientKeys = @{
  sr    = @{ '1008' = 'kcal'; '1003' = 'protein'; '1005' = 'carbs'; '1004' = 'fat'; '1079' = 'fibre' }
  fndds = @{ '208' = 'kcal'; '203' = 'protein'; '205' = 'carbs'; '204' = 'fat'; '291' = 'fibre' }
}
# SR Legacy categories left out: 3 baby foods, 10 pork, 13 beef, 17 lamb/veal/game (hundreds of raw cuts;
# FNDDS covers these meats as eaten), 24 American Indian/Alaska Native foods.
$skipSrCategories = @('3', '10', '13', '17', '24')
$maxPortions = 4

$datasets = @(
  @{ name = 'fndds'; url = 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_csv_2024-10-31.zip' },
  @{ name = 'sr'; url = 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip' }
)
# Foods already in data/basics.json (curated names and servings) are skipped here.
$curated = @{}
Import-Csv (Join-Path $PSScriptRoot 'basics.csv') | ForEach-Object { $curated[$_.fdc_id] = 1 }

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-ZipCsv($zip, $fileName) {
  $entry = $zip.Entries | Where-Object { $_.Name -eq $fileName } | Select-Object -First 1
  $reader = New-Object IO.StreamReader($entry.Open())
  try { return ($reader.ReadToEnd() | ConvertFrom-Csv) } finally { $reader.Dispose() }
}

function Normalize($s) { return (($s.ToLower() -replace '[^a-z0-9]+', ' ').Trim()) }

function Clean-Name($s) {
  $s = $s -replace ', NFS$', '' -replace ' NFS$', ''
  return $s.Trim()
}

function Clean-Portion($label) {
  $label = ($label -replace ', NFS', '' -replace '\s+', ' ').Trim().TrimStart(',').Trim()
  if ($label -match '^1 (.+)$') { $label = $Matches[1] }   # "1 cup" -> "cup" (shown as "1 × cup")
  if ($label.Length -gt 40) { $label = $label.Substring(0, 40).Trim() }
  return $label
}

$all = New-Object System.Collections.Generic.List[object]
$fnddsNames = @{}

foreach ($ds in $datasets) {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("usda_$($ds.name)_" + [guid]::NewGuid().ToString('N') + '.zip')
  try {
    Write-Host "Downloading $($ds.url)"
    Invoke-WebRequest -UseBasicParsing $ds.url -OutFile $tmp
    $zip = [IO.Compression.ZipFile]::OpenRead($tmp)
    try {
      $foods = Read-ZipCsv $zip 'food.csv'
      $keep = @{}
      foreach ($f in $foods) {
        if ($ds.name -eq 'sr' -and ($skipSrCategories -contains $f.food_category_id -or $curated.ContainsKey($f.fdc_id))) { continue }
        $keep[$f.fdc_id] = @{ name = (Clean-Name $f.description); values = @{}; portions = New-Object System.Collections.Generic.List[object] }
      }

      # Nutrients (streamed: food_nutrient.csv is large)
      $entry = $zip.Entries | Where-Object { $_.Name -eq 'food_nutrient.csv' } | Select-Object -First 1
      $nutrientIds = $nutrientKeys[$ds.name]
      $reader = New-Object IO.StreamReader($entry.Open())
      try {
        $null = $reader.ReadLine()
        while ($null -ne ($line = $reader.ReadLine())) {
          $cols = $line.Split(',')
          $fdc = $cols[1].Trim('"')
          if (-not $keep.ContainsKey($fdc)) { continue }
          $key = $nutrientIds[$cols[2].Trim('"')]
          if ($key) { $keep[$fdc].values[$key] = [double]::Parse($cols[3].Trim('"'), $inv) }
        }
      } finally { $reader.Dispose() }

      # Portions
      $units = @{}
      Read-ZipCsv $zip 'measure_unit.csv' | ForEach-Object { $units[$_.id] = $_.name }
      $portions = Read-ZipCsv $zip 'food_portion.csv' | Sort-Object { [int]$_.seq_num }
      foreach ($p in $portions) {
        $food = $keep[$p.fdc_id]
        if (-not $food -or $food.portions.Count -ge $maxPortions) { continue }
        $grams = [double]::Parse($p.gram_weight, $inv)
        if ($grams -le 0) { continue }
        if ($ds.name -eq 'fndds') {
          if ($p.portion_description -match 'Quantity not specified') { continue }
          $label = Clean-Portion $p.portion_description
        } else {
          $unit = $units[$p.measure_unit_id]
          if ($unit -eq 'undetermined') { $unit = '' }
          $label = Clean-Portion "$($p.amount) $unit $($p.modifier)"
        }
        if ($label) { $food.portions.Add([object[]]@($label, [Math]::Round($grams, 1))) }
      }
    } finally { $zip.Dispose() }
  } finally {
    Remove-Item -Force $tmp -ErrorAction SilentlyContinue
  }

  $prefix = if ($ds.name -eq 'fndds') { 'f' } else { 's' }
  foreach ($id in $keep.Keys) {
    $food = $keep[$id]
    $v = $food.values
    if (-not $v.ContainsKey('kcal')) { continue }
    $norm = Normalize $food.name
    if ($ds.name -eq 'fndds') { $fnddsNames[$norm] = 1 }
    elseif ($fnddsNames.ContainsKey($norm)) { continue }   # same food already in FNDDS
    $n = { param($k) if ($v.ContainsKey($k)) { [Math]::Round($v[$k], 1) } else { 0 } }
    $all.Add([object[]]@("$prefix$id", $food.name, (& $n 'kcal'), (& $n 'protein'), (& $n 'carbs'), (& $n 'fat'), (& $n 'fibre'), $food.portions.ToArray()))
  }
  Write-Host "  $($ds.name): $($all.Count) foods so far"
}

$out = [ordered]@{
  source  = 'USDA FoodData Central: FNDDS 2021-2023 (Survey foods) and SR Legacy (April 2018)'
  license = 'Public domain (CC0)'
  fields  = @('code', 'name', 'kcal', 'protein', 'carbs', 'fat', 'fibre', 'portions')
  note    = 'Nutrients are per 100 g; portions are [label, grams]'
  foods   = $all
}
$json = ConvertTo-Json $out -Compress -Depth 6
$dest = Join-Path $root 'data\global.json'
[IO.File]::WriteAllText($dest, $json, (New-Object Text.UTF8Encoding $false))
Write-Host "Wrote $($all.Count) foods to $dest ($([Math]::Round($json.Length / 1KB)) KB)"
