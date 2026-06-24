# DreamChecked

Estate inspection logging and tracking for **Dreamland Margate**.

Two editions live in this folder:

| Edition | Stack | Folder |
|---|---|---|
| **Local / standalone** | Python · Flask · SQLite | *(root of this folder)* |
| **M365 / Power Apps** | SharePoint · Power Apps · Power Automate | `provisioning/` `app/` `flows/` |

The rest of this README covers the **M365 edition**.  
For the local edition see the sections at the bottom.

---

## M365 edition — overview

```
provisioning/
  create-list.ps1      PnP PowerShell — creates the SharePoint list & columns
  teardown.ps1         Removes the list (with confirmation prompt — destructive)

app/
  src/
    App.pa.yaml        App OnStart: colour palette variables
    scrDashboard.pa.yaml  Screen 1 — stat tiles + two galleries
    scrLog.pa.yaml        Screen 2 — log a check (edit form)
    scrHistory.pa.yaml    Screen 3 — searchable history gallery
  output/              Packed .msapp files go here (gitignored after first pack)

flows/
  weekly-reminder-build-guide.md  Step-by-step PA build guide, all expressions included
```

---

## Prerequisites

### Tools (install once)

```powershell
# PnP.PowerShell (for SharePoint provisioning)
Install-Module PnP.PowerShell -Scope CurrentUser -Force

# Power Platform CLI (for canvas pack/unpack)
# Easiest: install the "Power Platform Tools" VS Code extension.
# Or via npm:
npm install -g @microsoft/powerplatform-vscode
# Then confirm:
pac --version
```

> **pac canvas pack/unpack is in preview.**  
> Always back up your `.msapp` before unpacking. After every repack, reopen
> in Studio and confirm it validates before publishing.

### Licences / permissions

- Microsoft 365 Business Standard or higher (covers Power Apps, Power Automate, SharePoint)
- SharePoint site owner (to create lists)
- Power Apps maker access (available to all M365 users by default)

---

## Step 1 — Provision the SharePoint list

Edit the site URL at the top of the script, then run:

```powershell
.\provisioning\create-list.ps1 -SiteUrl "https://YOURTENANT.sharepoint.com/sites/YOURSITE"
```

The script will:
1. Open an interactive browser login window.
2. Create the **DreamChecked Logs** list.
3. Rename the built-in **Title** column to **Ref** (optional).
4. Add all seven inspection columns with clean internal names (no URL-encoding).
5. Print the internal-name table to the console — **copy this into the table below**.

### Internal column names (fill in after running the script)

| Display name | Internal name | PA expression |
|---|---|---|
| Ref (Title) | `Title` | `'Ref'` or `Title` |
| Category | `Category` | `Category.Value` |
| Area / Asset | `AreaAsset` | `'Area / Asset'` |
| Check Type | `CheckType` | `'Check Type'` |
| Date Checked | `DateChecked` | `'Date Checked'` |
| Status | `Status` | `Status.Value` |
| Next Due | `NextDue` | `'Next Due'` |
| Notes | `Notes` | `Notes` |

> **Power Apps vs Power Automate naming:**  
> Power Apps references columns by their **display names** (quoted if they
> contain spaces/special chars). Power Automate expressions use the
> **internal names** shown in the middle column above.

---

## Step 2 — Install pac CLI and verify

```powershell
pac --version
# Expected: Microsoft Power Apps CLI 1.x.x or similar
```

If the command is not found, install the Power Platform Tools VS Code extension
and add the CLI to your PATH per its setup instructions.

---

## Step 3 — Create & export the blank stub .msapp

> Do this **before** running `pac canvas unpack`. The unpack step needs a
> real `.msapp` file as its starting point — the YAML files in `app/src/`
> replace the screen content, not the whole file.

1. Go to **make.powerapps.com**.
2. Click **+ Create > Blank app > Blank canvas app**.
3. Name it exactly: **DreamChecked** (no spaces in the internal name matters less
   here, but consistency helps).
4. Choose **Tablet** format. Click **Create**.
5. In Studio, go to **Data > Add data** and connect to your SharePoint site.
   Search for and add the **DreamChecked Logs** list.
6. The data source will appear as `DreamChecked_Logs` in the formula bar — verify
   this matches what the YAML files reference.
7. Without adding any screens or controls, go to **File > Save**.
8. Go to **File > Export package** (or **File > Save as > This computer** if
   Export package is not visible in your region).
   - If exporting as a package: download and unzip it; the `.msapp` is inside.
   - If "Save as > This computer" is available: this downloads the `.msapp` directly.
9. Rename the file to `DreamChecked-stub.msapp` and place it in `app/output/`.

---

## Step 4 — Unpack the stub

```powershell
pac canvas unpack `
  --msapp  .\app\output\DreamChecked-stub.msapp `
  --sources .\app\src
```

This writes the unpacked YAML into `app/src/`. The generated files will
include platform-managed content (entropy files, connection metadata, etc.)
that you should **not** edit — only replace the four `.pa.yaml` screen/app files.

> **Inspect the generated format first.**  
> Open one of the generated screen `.pa.yaml` files. Confirm the indentation
> and control-declaration syntax matches the files in `app/src/`. If your
> version of pac uses a slightly different YAML schema, adjust the hand-written
> files to match before proceeding.

---

## Step 5 — Pack and test each screen

After confirming the format, the four hand-written files are already in place.
Pack the app:

```powershell
pac canvas pack `
  --msapp   .\app\output\DreamChecked.msapp `
  --sources .\app\src
```

Open `DreamChecked.msapp` in Studio (**File > Open > Browse**). Studio will
validate the YAML. Fix any reported issues (usually minor property-name
differences between pac versions) and re-pack.

### Studio manual step — Log screen form

The edit form `frmLog` on **scrLog** requires the data cards to be configured
interactively in Studio (data card YAML is complex and version-sensitive):

1. Select the `frmLog` control on scrLog.
2. In the right panel, click **Edit fields**.
3. Add/reorder fields in this order:
   **Category → Area / Asset → Check Type → Date Checked → Status → Next Due → Notes**
4. Set **Default mode** to **New**.
5. Verify `DataSource = DreamChecked_Logs`.

After this Studio step, re-export the `.msapp` (`File > Save as > This computer`)
and commit it to `app/output/` so you have a clean baseline.

---

## Step 6 — Build the Power Automate flow

Follow `flows/weekly-reminder-build-guide.md`. Every expression is ready to
paste. The guide covers:
- Recurrence trigger (Mon 07:00 London TZ)
- SharePoint Get items + two filter arrays (Overdue / Due this week)
- Select + Create HTML table for each array
- Condition to skip empty weeks
- Send email V2 with navy/gold HTML template

---

## Step 7 — Publish

In Studio: **File > Publish > Publish this version**. Share with staff via
the Power Apps portal or the Power Apps mobile app.

---

## Known limitations / v2 backlog

| Limitation | Impact | Fix in v2 |
|---|---|---|
| `in` text search is not delegable on SharePoint | History search only works correctly up to ~2,000 rows | Migrate data source to Dataverse (fully delegable) |
| Get items action tops out at 500 rows | PA digest may miss records beyond 500 | Enable pagination on Get items action |
| Edit form data cards set in Studio | Prevents fully automated YAML deployment | Not fixable until data card YAML stabilises in pac |
| No offline/mobile optimisation | Requires Teams or Power Apps mobile with an active connection | Progressive Web App wrapper or offline caching in v2 |

---

## Toolchain versions this was built against

| Tool | Tested version |
|---|---|
| PnP.PowerShell | 2.x |
| pac (Power Platform CLI) | 1.x (SourceCode layout) |
| Power Apps Studio | Web — June 2026 |

---

## Local edition (Flask / SQLite)

The original standalone app needs no cloud account.  
Requirements: Python 3.9+

```bash
pip3 install -r requirements.txt
python3 app.py
# Open http://127.0.0.1:5000
```

See the full local edition docs in the section below the M365 content, or open
the original README at `git show main:dreamchecked/README.md`.
