# Weekly Compliance Reminder — Power Automate Build Guide

Scheduled flow · Monday 07:00 Europe/London  
Sends a navy/gold HTML digest email showing overdue and upcoming inspection checks.

> All expressions below are ready to paste. Internal column names match the
> output of `create-list.ps1` (explicit internal names, no URL-encoded spaces).

---

## Prerequisites

- Power Automate licence (included with M365 Business Standard+)
- SharePoint connector authenticated to your tenant
- Office 365 Outlook connector (for "Send an email V2")
- The `DreamChecked Logs` list already provisioned and populated

---

## Build order — action by action

Open **Power Automate > My flows > New flow > Scheduled cloud flow**.

### Trigger: Recurrence

| Field | Value |
|---|---|
| Name | `Weekly DreamChecked Digest` |
| Start time | Any future Monday date, `07:00:00` |
| Interval | `1` |
| Frequency | `Week` |
| Time zone | `(UTC+00:00) Dublin, Edinburgh, Lisbon, London` |
| On these days | `Monday` |

---

### Action 1 — Get items (SharePoint)

**Connector:** SharePoint  
**Action:** Get items

| Field | Value |
|---|---|
| Site Address | *(pick your site from dropdown)* |
| List Name | `DreamChecked Logs` |
| Top Count | `500` |

> Leave all filter/order fields blank — we filter in-flow so we can reuse
> the result set for both overdue and due-this-week arrays.

---

### Action 2 — Filter array: Overdue

**Connector:** Data Operation  
**Action:** Filter array

**From:**
```
@body('Get_items')?['value']
```

**Filter (Advanced mode — paste into the expression box):**
```
@and(
  not(empty(item()?['NextDue'])),
  less(
    formatDateTime(item()?['NextDue'], 'yyyy-MM-dd'),
    formatDateTime(utcNow(), 'yyyy-MM-dd')
  )
)
```

**Rename this action:** `Filter_Overdue`

---

### Action 3 — Filter array: Due this week

**Connector:** Data Operation  
**Action:** Filter array

**From:**
```
@body('Get_items')?['value']
```

**Filter (Advanced mode):**
```
@and(
  not(empty(item()?['NextDue'])),
  greaterOrEquals(
    formatDateTime(item()?['NextDue'], 'yyyy-MM-dd'),
    formatDateTime(utcNow(), 'yyyy-MM-dd')
  ),
  lessOrEquals(
    formatDateTime(item()?['NextDue'], 'yyyy-MM-dd'),
    formatDateTime(addDays(utcNow(), 7), 'yyyy-MM-dd')
  )
)
```

**Rename this action:** `Filter_DueThisWeek`

---

### Action 4 — Select: Overdue rows

**Connector:** Data Operation  
**Action:** Select

**From:**
```
@body('Filter_Overdue')
```

**Map (switch to text mode — paste as-is):**
```json
{
  "Asset":    "@{item()?['AreaAsset']}",
  "Category": "@{item()?['Category']?['Value']}",
  "Check":    "@{item()?['CheckType']}",
  "Was due":  "@{formatDateTime(item()?['NextDue'], 'dd MMM yyyy')}"
}
```

**Rename:** `Select_Overdue`

---

### Action 5 — Select: Due-this-week rows

Same as Action 4, but **From:**
```
@body('Filter_DueThisWeek')
```

**Rename:** `Select_DueThisWeek`

---

### Action 6 — Create HTML table: Overdue

**Connector:** Data Operation  
**Action:** Create HTML table

**From:**
```
@body('Select_Overdue')
```

Leave Columns as **Automatic**.

**Rename:** `Table_Overdue`

---

### Action 7 — Create HTML table: Due this week

Same, **From:**
```
@body('Select_DueThisWeek')
```

**Rename:** `Table_DueThisWeek`

---

### Action 8 — Condition: skip empty weeks

**Connector:** Control  
**Action:** Condition

**Expression (use the expression editor):**
```
@greater(add(length(body('Filter_Overdue')), length(body('Filter_DueThisWeek'))), 0)
```

This is `True` if either list has at least one item.

**If yes branch:** proceed to Action 9 (send email).  
**If no branch:** leave empty (the flow ends silently — no email sent).

---

### Action 9 — Send an email (V2)  *(inside the Yes branch)*

**Connector:** Office 365 Outlook  
**Action:** Send an email (V2)

| Field | Value |
|---|---|
| To | your email address |
| Subject | *(expression — paste below)* |
| Body | *(expression — paste below)* |

**Subject expression:**
```
@concat(
  'DreamChecked — ',
  string(length(body('Filter_Overdue'))),
  ' overdue, ',
  string(length(body('Filter_DueThisWeek'))),
  ' due this week'
)
```

**Body — switch to HTML mode, paste the full template:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body  { font-family: Segoe UI, sans-serif; background:#0F1F3D; color:#EEF2F8; margin:0; padding:24px; }
    h1    { color:#C9A84A; font-size:22px; margin:0 0 4px; }
    p.sub { color:#9FB0C9; font-size:13px; margin:0 0 28px; }
    h2    { color:#E3C976; font-size:15px; border-bottom:1px solid #16294F; padding-bottom:6px; }
    table { border-collapse:collapse; width:100%; margin-bottom:32px; }
    th    { background:#16294F; color:#C9A84A; text-align:left; padding:8px 12px; font-size:12px; }
    td    { padding:8px 12px; font-size:13px; border-bottom:1px solid #16294F; color:#EEF2F8; }
    .badge-red  { background:#D9534F; color:#fff; border-radius:4px; padding:2px 8px; font-size:11px; font-weight:bold; }
    .badge-gold { background:#C9A84A; color:#0F1F3D; border-radius:4px; padding:2px 8px; font-size:11px; font-weight:bold; }
    .footer { color:#9FB0C9; font-size:11px; margin-top:24px; }
  </style>
</head>
<body>
  <h1>DreamChecked Weekly Digest</h1>
  <p class="sub">@{formatDateTime(utcNow(), 'dddd d MMMM yyyy')} · Dreamland Margate</p>

  <h2>⚠ Overdue (@{length(body('Filter_Overdue'))})</h2>
  @{body('Table_Overdue')}

  <h2>📅 Due this week (@{length(body('Filter_DueThisWeek'))})</h2>
  @{body('Table_DueThisWeek')}

  <p class="footer">
    Sent automatically every Monday at 07:00 by Power Automate.<br>
    Log checks: open DreamChecked in Power Apps.
  </p>
</body>
</html>
```

> **Tip:** Power Automate may inject its own `<style>` reset. If the tables
> look unstyled in Outlook, set **Is HTML** = Yes and test with a real send.

---

## Internal column name reference

| Display name in Power Apps | Internal name in PA expressions |
|---|---|
| Ref (built-in Title) | `Title` |
| Category | `Category` (Choice → append `?['Value']`) |
| Area / Asset | `AreaAsset` |
| Check Type | `CheckType` |
| Date Checked | `DateChecked` |
| Status | `Status` (Choice → append `?['Value']`) |
| Next Due | `NextDue` |
| Notes | `Notes` |

---

## Testing the flow

1. Save and click **Test > Manually**.
2. Inspect the **Filter_Overdue** and **Filter_DueThisWeek** run outputs to verify filtering.
3. If the Condition is True, the email appears in your inbox within ~30 seconds.
4. If you want to test without real overdue items, temporarily change the Overdue
   filter to `greaterOrEquals(...)` so it always matches some rows.

---

## Gotchas

- **Time zone shift:** The London TZ offsets between GMT and BST — Power Automate
  handles this automatically when you select the London timezone on the trigger.
- **Choice columns in filter:** `item()?['Category']` returns an object; use
  `item()?['Category']?['Value']` to get the string. The filter arrays above use
  `NextDue` (a date string) directly, which is fine for string comparison.
- **500-row limit:** The SharePoint Get items action returns a maximum of 500 rows
  per call. If your log grows beyond 500, add pagination (Settings > Pagination
  on the Get items action, set threshold to e.g. 5000).
