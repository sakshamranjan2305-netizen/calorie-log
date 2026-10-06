# One-off: downloads the Indian Nutrient Databank (INDB) spreadsheet and writes a compact
# data/indb.json that the app bundles for offline search.
# Source: https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB- (open access, CC BY)
#
# Usage (from the project folder):  powershell -ExecutionPolicy Bypass -File tools\convert-indb.ps1
param(
  [string]$Url = 'https://raw.githubusercontent.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-/main/INDB.xlsx'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$inv = [Globalization.CultureInfo]::InvariantCulture
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('indb_' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $tmp | Out-Null

function Num($v) {
  if ($null -eq $v -or "$v" -eq '') { return 0.0 }
  return [double]::Parse("$v", $inv)
}
function R1($x) { return [Math]::Round($x, 1) }

try {
  $xlsx = Join-Path $tmp 'INDB.xlsx'
  Write-Host "Downloading $Url"
  Invoke-WebRequest -UseBasicParsing $Url -OutFile $xlsx
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [IO.Compression.ZipFile]::ExtractToDirectory($xlsx, "$tmp\x")

  # Shared strings table (cells with t="s" hold an index into it)
  [xml]$ss = [IO.File]::ReadAllText("$tmp\x\xl\sharedStrings.xml")
  $strings = New-Object System.Collections.Generic.List[string]
  foreach ($si in $ss.sst.si) {
    $t = $si.SelectNodes('*[local-name()="t"] | *[local-name()="r"]/*[local-name()="t"]')
    $strings.Add((($t | ForEach-Object { $_.InnerText }) -join ''))
  }

  [xml]$sheet = [IO.File]::ReadAllText("$tmp\x\xl\worksheets\sheet1.xml")
  $rows = $sheet.worksheet.sheetData.row

  function CellValue($c) {
    switch ($c.t) {
      's'         { return $strings[[int]$c.v] }
      'inlineStr' { return $c.is.InnerText }
      default     { return $c.v }
    }
  }
  function RowMap($row) {
    $m = @{}
    foreach ($c in $row.c) { $m[($c.r -replace '\d', '')] = CellValue $c }
    return $m
  }

  # Column letter -> header name, then header name -> column letter
  $header = RowMap $rows[0]
  $col = @{}
  foreach ($k in $header.Keys) { $col[$header[$k]] = $k }
  foreach ($need in 'food_code','food_name','energy_kcal','protein_g','carb_g','fat_g','fibre_g',
                    'servings_unit','unit_serving_energy_kcal','unit_serving_protein_g','unit_serving_carb_g') {
    if (-not $col.ContainsKey($need)) { throw "Column '$need' not found in INDB.xlsx" }
  }

  $foods = New-Object System.Collections.Generic.List[object]
  $noServing = 0
  for ($i = 1; $i -lt $rows.Count; $i++) {
    $m = RowMap $rows[$i]
    $name = "$($m[$col['food_name']])".Trim()
    if (-not $name) { continue }
    $kcal = Num $m[$col['energy_kcal']]
    $protein = Num $m[$col['protein_g']]
    $carbs = Num $m[$col['carb_g']]
    $unit = "$($m[$col['servings_unit']])".Trim()

    # INDB's per-serving values are the per-100 g values scaled by the serving weight,
    # so recover that weight from whichever nutrient is non-zero.
    $grams = 0
    foreach ($pair in @(@($kcal, 'unit_serving_energy_kcal'), @($carbs, 'unit_serving_carb_g'), @($protein, 'unit_serving_protein_g'))) {
      if ($pair[0] -gt 0) { $grams = [Math]::Round((Num $m[$col[$pair[1]]]) / $pair[0] * 100); break }
    }
    if (-not $unit -or $grams -le 0) { $unit = ''; $grams = 0; $noServing++ }

    $foods.Add(@(
      "$($m[$col['food_code']])", $name,
      (R1 $kcal), (R1 $protein), (R1 $carbs), (R1 (Num $m[$col['fat_g']])), (R1 (Num $m[$col['fibre_g']])),
      $unit, [int]$grams
    ))
  }

  $out = [ordered]@{
    source  = 'Indian Nutrient Databank (INDB), Anuvaad Solutions / Vijayakumar et al., Current Developments in Nutrition 2024'
    license = 'CC BY'
    fields  = @('code', 'name', 'kcal', 'protein', 'carbs', 'fat', 'fibre', 'servingUnit', 'servingGrams')
    note    = 'Nutrients are per 100 g; servingGrams is the weight of one servingUnit'
    foods   = $foods
  }
  $json = ConvertTo-Json $out -Compress -Depth 5
  $dest = Join-Path $root 'data\indb.json'
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  [IO.File]::WriteAllText($dest, $json, (New-Object Text.UTF8Encoding $false))
  Write-Host "Wrote $($foods.Count) foods to $dest ($([Math]::Round($json.Length / 1KB)) KB); $noServing without a serving size"
}
finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
