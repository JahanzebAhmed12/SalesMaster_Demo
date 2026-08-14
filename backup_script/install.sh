#!/usr/bin/env bash
# =============================================================================
# install.sh — One-time setup for the SQLite backup system
# Run as root or a user with sudo / cron access.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/backup.conf"

echo ""
echo "================================================"
echo "  SQLite Backup System — Installer"
echo "================================================"
echo ""

# ---- Load config -----------------------------------------------------------
[[ -f "$CONFIG_FILE" ]] || { echo "ERROR: backup.conf not found. Please copy and edit it first."; exit 1; }
source "$CONFIG_FILE"

# ---- Make scripts executable -----------------------------------------------
chmod +x "${SCRIPT_DIR}/sqlite_backup.sh"
chmod +x "${SCRIPT_DIR}/restore_backup.sh"
chmod +x "${SCRIPT_DIR}/backup_status.sh"
echo "✔  Scripts marked executable."

# ---- Create required directories -------------------------------------------
mkdir -p "$BACKUP_ROOT" "$LOG_DIR"
echo "✔  Directories created: $BACKUP_ROOT  |  $LOG_DIR"

# ---- Validate sqlite3 is available -----------------------------------------
if ! command -v sqlite3 &>/dev/null; then
    echo ""
    echo "ERROR: sqlite3 not found. Install it first:"
    echo "  Debian/Ubuntu:  sudo apt-get install sqlite3"
    echo "  RHEL/CentOS:    sudo yum install sqlite"
    echo ""
    exit 1
fi
echo "✔  sqlite3 found: $(sqlite3 --version)"

# ---- Install cron job (runs every hour, on the hour) -----------------------
CRON_LINE="0 * * * * ${SCRIPT_DIR}/sqlite_backup.sh >> ${LOG_DIR}/cron.log 2>&1"

if crontab -l 2>/dev/null | grep -qF "sqlite_backup.sh"; then
    echo "✔  Cron job already installed (skipping)."
else
    ( crontab -l 2>/dev/null || true; echo "$CRON_LINE" ) | crontab -
    echo "✔  Cron job installed: $CRON_LINE"
fi

# ---- Run a test backup -----------------------------------------------------
echo ""
echo "Running first backup (dry-run to verify config)..."
if "${SCRIPT_DIR}/sqlite_backup.sh" --dry-run --verbose; then
    echo ""
    echo "✔  Dry-run successful."
else
    echo ""
    echo "✘  Dry-run encountered errors. Fix config and re-run."
    exit 1
fi

echo ""
echo "================================================"
echo "  Installation complete!"
echo ""
echo "  Files:"
echo "    Config  : $CONFIG_FILE"
echo "    Backups : $BACKUP_ROOT"
echo "    Logs    : $LOG_DIR/backup.log"
echo "    Report  : $LOG_DIR/backup_report.txt"
echo "    Cron    : runs every hour on the hour"
echo ""
echo "  Commands:"
echo "    Run backup now  : ${SCRIPT_DIR}/sqlite_backup.sh"
echo "    Restore latest  : ${SCRIPT_DIR}/restore_backup.sh"
echo "    List backups    : ${SCRIPT_DIR}/restore_backup.sh --list"
echo "    Health check    : ${SCRIPT_DIR}/backup_status.sh"
echo "================================================"
echo ""
