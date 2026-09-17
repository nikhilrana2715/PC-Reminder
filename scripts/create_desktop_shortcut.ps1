# Create Desktop Shortcut for NeumoRemind
$desktop = [Environment]::GetFolderPath('Desktop')
$target = Join-Path $PSScriptRoot '..\dist\NeumoRemind-win32-x64\NeumoRemind.exe'
$workdir = Join-Path $PSScriptRoot '..\dist\NeumoRemind-win32-x64'
$icon = Join-Path $PSScriptRoot '..\assets\icons\icon.ico'
$lnkPath = Join-Path $desktop 'NeumoRemind.lnk'

$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($lnkPath)
$s.TargetPath = (Resolve-Path $target).Path
$s.WorkingDirectory = (Resolve-Path $workdir).Path
$s.IconLocation = (Resolve-Path $icon).Path
$s.Description = 'NeumoRemind 24/7 Desktop Reminder Engine'
$s.Save()

if (Test-Path $lnkPath) {
    Write-Host "SUCCESS: Desktop shortcut created at: $lnkPath"
} else {
    Write-Host "FAILED: Could not create shortcut"
}
