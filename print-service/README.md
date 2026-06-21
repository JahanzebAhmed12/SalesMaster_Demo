# SalesMaster Print Service

Polls the SalesMaster VPS for pending print jobs and sends them to the EPSON LQ-350 ESC/P2 dot matrix printer via Chrome (CDP) + SumatraPDF.

---

## Production Setup (Print PC)

### Prerequisites
- Node.js 14+ installed
- Google Chrome installed (`C:\Program Files\Google\Chrome\Application\chrome.exe`)
- SumatraPDF.exe placed in this folder (download from https://www.sumatrapdfreader.org)

### Step 1 — First-time paper size configuration (run once)
```
setup-print-config.bat
```
This opens Chrome with a sample invoice. In the print dialog:
1. Select printer: **EPSON LQ-350 ESC/P2**
2. Click **More settings**
3. Paper size: **DOT MATRIX (18.6x20)**
4. Margins: **None**
5. Click **Print**, then close Chrome

Chrome saves these settings to `chrome-profile/` automatically.

### Step 2 — Install as Windows Service (run as Administrator)
```
INSTALL-SERVICE.bat
```
Right-click → **Run as administrator**

This installs "SalesMaster Print Service" into Windows Services:
- Starts automatically on every boot
- Restarts automatically if it crashes
- Runs silently in the background (no window)
- Logs to `logs/` folder

### Step 3 — Verify it's running
Open **services.msc** and look for **SalesMaster Print Service** — it should show **Running**.

Or check the status file: `auto-chrome-status.json`

---

## Daily Operation

Once installed, the service runs completely automatically:
- Polls the VPS every 10 seconds for new print jobs
- Generates PDF via Chrome at exact 189mm × 203.2mm
- Sends PDF to printer via SumatraPDF (no dialog, no interaction)
- Saves a preview PDF in `temp/` for layout inspection

**No bat file needed. No login required. Starts on boot.**

---

## Management Commands

All must be run as Administrator:

| Action | Command |
|--------|---------|
| Install service | `INSTALL-SERVICE.bat` |
| Uninstall service | `UNINSTALL-SERVICE.bat` |
| Start service | `sc start "SalesMaster Print Service"` |
| Stop service | `sc stop "SalesMaster Print Service"` |
| Check status | `sc query "SalesMaster Print Service"` |
| View logs | Open `logs/` folder |

---

## Re-configure paper size

If the printer or paper size changes:
1. Stop the service: `sc stop "SalesMaster Print Service"`
2. Run: `setup-print-config.bat`
3. Start the service: `sc start "SalesMaster Print Service"`

---

## Log Files

Logs are written to the `logs/` folder:
- `salesmaster-print-service.log` — main service log
- `salesmaster-print-service.out.log` — stdout
- `salesmaster-print-service.err.log` — stderr (errors)

The `auto-chrome-status.json` file shows the last known status and is updated after every print job.

---

## Troubleshooting

**Service won't start:**
- Check `logs/` for error details
- Verify Node.js is in system PATH: `node --version` in cmd
- Verify Chrome is at `C:\Program Files\Google\Chrome\Application\chrome.exe`

**Wrong paper size:**
- Re-run `setup-print-config.bat` and choose the correct paper size

**Jobs not printing:**
- Check `auto-chrome-status.json` for VPS connection status
- Verify `SumatraPDF.exe` is in this folder
- Check printer name in `auto-chrome-service.js` matches exactly: `EPSON LQ-350 ESC/P2`
