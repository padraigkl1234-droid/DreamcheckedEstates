#Requires -Modules PnP.PowerShell
<#
.SYNOPSIS
  Provisions the "DreamChecked Logs" SharePoint list for Dreamland Margate.

.DESCRIPTION
  Creates the list, renames Title → Ref (optional), adds all inspection
  columns with explicit internal names (no URL-encoded spaces), and prints
  the internal name table you need for Power Automate expressions.

.PARAMETER SiteUrl
  Full URL of the target SharePoint site.
  Example: https://contoso.sharepoint.com/sites/Dreamland

.EXAMPLE
  .\create-list.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/Dreamland"
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$SiteUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── 1. Connect ──────────────────────────────────────────────────────────────
Write-Host "`nConnecting to $SiteUrl ..." -ForegroundColor Cyan
Connect-PnPOnline -Url $SiteUrl -Interactive

# ── 2. Create the list ──────────────────────────────────────────────────────
$listTitle = "DreamChecked Logs"

$existingList = Get-PnPList -Identity $listTitle -ErrorAction SilentlyContinue
if ($existingList) {
    Write-Warning "List '$listTitle' already exists. Run teardown.ps1 first if you want a clean rebuild."
    exit 1
}

Write-Host "Creating list: $listTitle" -ForegroundColor Cyan
New-PnPList -Title $listTitle -Template GenericList -OnQuickLaunch | Out-Null
Write-Host "  List created." -ForegroundColor Green

# ── 3. Rename Title → Ref (make optional) ───────────────────────────────────
Write-Host "Renaming Title → Ref (optional)..."
Set-PnPField -List $listTitle -Identity "Title" -Values @{
    Title       = "Ref"
    Required    = $false
    Description = "Short reference code. Leave blank — auto-populated by ID if omitted."
}

# ── 4. Add columns ──────────────────────────────────────────────────────────
# Using explicit InternalName values that contain no spaces/special chars,
# so Power Automate expressions can reference them without URL-encoding.
Write-Host "Adding columns..."

# Category (Choice)
Add-PnPFieldFromXml -List $listTitle -FieldXml @"
<Field Type="Choice"
       DisplayName="Category"
       Name="Category"
       Required="FALSE"
       Format="Dropdown">
  <CHOICES>
    <CHOICE>Toilets</CHOICE>
    <CHOICE>Vendors</CHOICE>
    <CHOICE>Bars</CHOICE>
    <CHOICE>Scenic Railway</CHOICE>
    <CHOICE>Electrical/PAT</CHOICE>
    <CHOICE>Fire Safety</CHOICE>
  </CHOICES>
</Field>
"@ | Out-Null

# Area / Asset (Single line text) — internal name: AreaAsset
Add-PnPField -List $listTitle `
    -DisplayName "Area / Asset" `
    -InternalName "AreaAsset" `
    -Type Text `
    -Required:$false | Out-Null

# Check Type (Single line text) — internal name: CheckType
Add-PnPField -List $listTitle `
    -DisplayName "Check Type" `
    -InternalName "CheckType" `
    -Type Text `
    -Required:$false | Out-Null

# Date Checked (Date only) — internal name: DateChecked
Add-PnPField -List $listTitle `
    -DisplayName "Date Checked" `
    -InternalName "DateChecked" `
    -Type DateTime `
    -Required:$false | Out-Null
Set-PnPField -List $listTitle -Identity "DateChecked" -Values @{ DateOnly = $true }

# Status (Choice) — internal name: Status
Add-PnPFieldFromXml -List $listTitle -FieldXml @"
<Field Type="Choice"
       DisplayName="Status"
       Name="Status"
       Required="FALSE"
       Format="Dropdown">
  <CHOICES>
    <CHOICE>Pass/OK</CHOICE>
    <CHOICE>Needs Action</CHOICE>
    <CHOICE>Fail</CHOICE>
  </CHOICES>
</Field>
"@ | Out-Null

# Next Due (Date only) — internal name: NextDue
Add-PnPField -List $listTitle `
    -DisplayName "Next Due" `
    -InternalName "NextDue" `
    -Type DateTime `
    -Required:$false | Out-Null
Set-PnPField -List $listTitle -Identity "NextDue" -Values @{ DateOnly = $true }

# Notes (Multi-line text, plain) — internal name: Notes
Add-PnPField -List $listTitle `
    -DisplayName "Notes" `
    -InternalName "Notes" `
    -Type Note `
    -Required:$false | Out-Null
Set-PnPField -List $listTitle -Identity "Notes" -Values @{ RichText = $false }

Write-Host "  All columns added." -ForegroundColor Green

# ── 5. Print internal-name table ────────────────────────────────────────────
Write-Host ""
Write-Host "=== INTERNAL COLUMN NAMES (needed for Power Automate expressions) ===" -ForegroundColor Cyan
Write-Host "(Copy this table into the README before closing the terminal)`n"

$skipFields = @(
    "ContentType","_ModerationComments","File_x0020_Type","ID","Modified",
    "Created","Author","Editor","_HasCopyDestinations","_CopySource",
    "owshiddenversion","WorkflowVersion","_UIVersion","_UIVersionString",
    "Attachments","_ModerationStatus","SelectTitle","InstanceID","Order",
    "GUID","WorkflowInstanceID","FileRef","FileDirRef","Last_x0020_Modified",
    "Created_x0020_Date","FSObjType","PermMask","FileLeafRef","UniqueId",
    "SyncClientId","ProgId","ScopeId","HTML_x0020_File_x0020_Type",
    "MetaInfo","_Level","_IsCurrentVersion","ItemChildCount","FolderChildCount",
    "Restricted","OriginatorId","NoExecute","ContentVersion","AppAuthor",
    "AppEditor"
)

Get-PnPField -List $listTitle |
    Where-Object { $_.Hidden -eq $false -and $_.ReadOnlyField -eq $false -and $_.InternalName -notin $skipFields } |
    Select-Object DisplayName, InternalName, TypeAsString |
    Sort-Object DisplayName |
    Format-Table -AutoSize

Write-Host "`nProvisioning complete." -ForegroundColor Green
Write-Host "Next step: follow README.md > 'Step 3 — Create & export stub .msapp' to build the canvas app."
