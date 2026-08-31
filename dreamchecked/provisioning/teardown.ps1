#Requires -Modules PnP.PowerShell
<#
.SYNOPSIS
  Deletes the "DreamChecked Logs" SharePoint list. Irreversible — prompts first.

.PARAMETER SiteUrl
  Full URL of the target SharePoint site.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$SiteUrl
)

$listTitle = "DreamChecked Logs"

Write-Host ""
Write-Warning "This will permanently delete '$listTitle' and ALL its data from:"
Write-Warning "  $SiteUrl"
Write-Host ""
$confirm = Read-Host "Type 'DELETE' (all caps) to confirm, or anything else to cancel"

if ($confirm -ne "DELETE") {
    Write-Host "Cancelled. Nothing was changed." -ForegroundColor Yellow
    exit 0
}

Connect-PnPOnline -Url $SiteUrl -Interactive
Remove-PnPList -Identity $listTitle -Force
Write-Host "List '$listTitle' deleted." -ForegroundColor Green
