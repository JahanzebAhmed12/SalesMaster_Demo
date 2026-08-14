#!/usr/bin/env bash
# =============================================================================
# restore_backup.sh — Restore a SQLite backup created by sqlite_backup.sh
#
# Usage:
#   ./restore_backup.sh                        # restore from latest backup
#   ./restore_backup.sh /path/to/backup.db.gz  # restore specific file
#   ./restore_backup.sh --list                 # list available backups
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/backup.conf"

[[ -f "$CONFIG_FILE" ]] || { echo "ERROR: backup.conf not found"; exit 1; }
source "$CONFIG_FILE"

usage() {
    echo "Usage: $0 [--list] [backup_file.db.gz]"
    echo ""
    echo "  --list              List available backups (newest first)"
    echo "  backup_file.db.gz   Restore a specific backup file"
    echo "  (no argument)       Restore the latest backup"
    exit 0
}

list_backups() {
    echo "Available backups (newest first):"
    echo "-----------------------------------"
    find "$BACKUP_ROOT" -type f -name "*.db.gz" | sort -r | while read -r f; do
        local size mod
        size="$(du -sh "$f" | cut -f1)"
        mod="$(date -d "@$(stat -c '%Y' "$f" 2>/dev/null)" '+%Y-%m-%d %H:%M:%S' 2>/dev/null \
               || date -r "$f" '+%Y-%m-%d %H:%M:%S' 2>/dev/null)"
        printf "  %-60s  %6s  %s\n" "$f" "$size" "$mod"
    done
}

verify_checksum() {
    local file="$1"
    local csum="${file}.sha256"
    if [[ -f "$csum" ]]; then
        local expected actual
        expected="$(cat "$csum")"
        actual="$(sha256sum "$file" | awk '{print $1}')"
        if [[ "$expected" != "$actual" ]]; then
            echo "ERROR: Checksum mismatch for $file!" >&2
            echo "  Expected : $expected" >&2
            echo "  Actual   : $actual" >&2
            exit 1
        fi
        echo "Checksum OK: $actual"
    else
        echo "WARNING: No checksum file found. Skipping verification."
    fi
}

restore() {
    local backup_file="$1"
    local target_db="$DB_PATH"

    echo "================================================"
    echo " SQLite Restore"
    echo "================================================"
    echo "Backup file : $backup_file"
    echo "Target DB   : $target_db"
    echo ""

    [[ -f "$backup_file" ]] || { echo "ERROR: Backup file not found: $backup_file"; exit 1; }

    # Verify checksum
    verify_checksum "$backup_file"

    # Verify the compressed file is a valid gzip
    if ! gzip -t "$backup_file" 2>/dev/null; then
        echo "ERROR: Backup file is not a valid gzip archive." >&2; exit 1
    fi

    # Confirm with user
    echo ""
    if [[ -f "$target_db" ]]; then
        echo "WARNING: This will OVERWRITE the existing database at:"
        echo "  $target_db"
    fi
    read -r -p "Proceed? [yes/N]: " confirm
    [[ "${confirm,,}" == "yes" ]] || { echo "Aborted."; exit 0; }

    # Create a safety backup of the current DB before overwriting
    if [[ -f "$target_db" ]]; then
        local safety="${target_db}.pre_restore_$(date '+%Y%m%d_%H%M%S').bak"
        echo "Creating safety backup of current DB: $safety"
        cp "$target_db" "$safety"
    fi

    # Decompress to a temp file, then integrity-check before replacing
    local tmp_db
    tmp_db="$(mktemp "${target_db}.restore_XXXXXX")"
    echo "Decompressing..."
    gzip -dc "$backup_file" > "$tmp_db"

    echo "Running integrity check on restored database..."
    local result
    result="$(sqlite3 "$tmp_db" 'PRAGMA integrity_check;' 2>&1)"
    if [[ "$result" != "ok" ]]; then
        rm -f "$tmp_db"
        echo "ERROR: Integrity check failed:" >&2
        echo "$result" >&2
        exit 1
    fi
    echo "Integrity check passed."

    # Atomic replace
    mv "$tmp_db" "$target_db"
    echo ""
    echo "Restore complete: $target_db"
    echo "================================================"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
case "${1:-}" in
    --help|-h) usage ;;
    --list)    list_backups ;;
    "")
        LATEST="${BACKUP_ROOT}/latest.db.gz"
        if [[ ! -L "$LATEST" ]] && [[ ! -f "$LATEST" ]]; then
            echo "ERROR: No latest backup symlink found at $LATEST" >&2; exit 1
        fi
        restore "$(readlink -f "$LATEST")"
        ;;
    *)
        restore "$1"
        ;;
esac
