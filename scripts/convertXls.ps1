# 구형 .xls 스펙시트 → .xlsx 변환 + zip 해제 (시드 빌드 전제)
#
# read-excel-file은 .xls(BIFF)를 읽지 못한다. 그래서 예전에는 .xls 10개와 zip 2개가
# 경고 한 줄 없이 시드에서 빠졌다(doc/05_설계결정/시드_적재_전수조사_2026-07-14.md).
# 이제 buildSpecSeed.ts의 커버리지 가드가 변환본이 없으면 빌드를 실패시킨다.
#
# 실행: powershell -File scripts/convertXls.ps1
# 전제: Excel 설치(COM). 변환본은 원본 폴더 하위에만 쓰고 원본은 건드리지 않는다.

$ErrorActionPreference = 'Stop'
$src = Resolve-Path "$PSScriptRoot\..\..\03_참고자료\LG전자 스펙시트 모음"
$xlsDir = Join-Path $src 'xls_converted'
$zipDir = Join-Path $src 'zip_extracted'
foreach ($d in @($xlsDir, $zipDir)) { if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null } }

# ── .xls → .xlsx ──
# 주의: Get-ChildItem -Filter *.xls 는 .xlsx까지 잡는다(Windows 8.3 이름 매칭) → Extension으로 거른다.
$xls = Get-ChildItem -Path $src -File | Where-Object { $_.Extension -eq '.xls' }
if ($xls) {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  foreach ($f in $xls) {
    $out = Join-Path $xlsDir ($f.BaseName + '.xlsx')
    if (Test-Path $out) { Write-Output "skip $($f.Name)"; continue }
    $wb = $excel.Workbooks.Open($f.FullName, 0, $true)
    $wb.SaveAs($out, 51)   # 51 = xlOpenXMLWorkbook
    $wb.Close($false)
    Write-Output "conv $($f.Name)"
  }
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}

# ── zip 해제 (내부 xlsx만) ──
Add-Type -AssemblyName System.IO.Compression.FileSystem
foreach ($z in Get-ChildItem -Path $src -Filter *.zip -File) {
  $zip = [System.IO.Compression.ZipFile]::OpenRead($z.FullName)
  foreach ($e in $zip.Entries) {
    if ($e.Name -match '\.xlsx$') {
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path $zipDir $e.Name), $true)
      Write-Output "unzip $($e.Name)"
    }
  }
  $zip.Dispose()
}

Write-Output "완료 — 이제 npm run seed:build 를 실행한다."
