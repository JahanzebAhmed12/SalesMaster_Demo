#!/usr/bin/env bash
# =============================================================================
# backup_status.sh — Quick health check for the backup system
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/backup.conf"

[[ -f "$CONFIG_FILE" ]] || { echo "ERROR: backup.conf not found"; exit 1; }
source "$CONFIG_FILE"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'

ok()   { echo -e "  ${GREEN}✔${NC}  $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC}  $*"; }
fail() { echo -e "  ${RED}✘${NC}  $*"; }

echo ""
echo "======================================"
echo "  SQLite Backup System — Health Check"
echo "======================================"
echo ""

# 1. Latest backup age
LATEST="${BACKUP_ROOT}/latest.db.gz"
if [[ -L "$LATEST" ]] || [[ -f "$LATEST" ]]; then
    real="$(readlink -f "$LATEST" 2>/dev/null || echo "$LATEST")"
    if [[ -f "$real" ]]; then
        fmod="$(stat -c '%Y' "$real" 2>/dev/null || stat -f '%m' "$real" 2>/dev/null)"
        age_min=$(( ( $(date '+%s') - fmod ) / 60 ))
        age_hrs=$(( age_min / 60 ))
        if (( age_min <= 70 )); then
            ok "Latest backup: ${age_min}min ago (${real##*/})"
        elif (( age_hrs <= 25 )); then
            warn "Latest backup: ${age_hrs}h ago — may have missed a run (${real##*/})"
        else
            fail "Latest backup: ${age_hrs}h ago — STALE!"
        fi
    else
        fail "latest.db.gz symlink is broken"
    fi
else
    fail "No latest.db.gz found in $BACKUP_ROOT"
fi

# 2. Disk space
avail_kb="$(df -Pk "$BACKUP_ROOT" | awk 'NR==2{print $4}')"
avail_mb=$(( avail_kb / 1024 ))
total_used="$(du -sh "$BACKUP_ROOT" 2>/dev/null | cut -f1)"
if (( avail_mb >= MIN_FREE_MB )); then
    ok "Disk space: ${avail_mb}MB free (backups using ${total_used})"
else
    fail "Disk space: only ${avail_mb}MB free! (threshold: ${MIN_FREE_MB}MB)"
fi

# 3. DB file accessible
if [[ -f "$DB_PATH" ]]; then
    db_size="$(du -sh "$DB_PATH" | cut -f1)"
    ok "Source DB found: $DB_PATH ($db_size)"
else
    fail "Source DB missing: $DB_PATH"
fi

# 4. Cron job installed
if crontab -l 2>/dev/null | grep -q "sqlite_backup.sh"; then
    ok "Cron job is installed"
else
    warn "Cron job not found — run: crontab -e  and add the hourly entry"
fi

# 5. Recent errors in log
if [[ -f "${LOG_DIR}/backup.log" ]]; then
    recent_errors="$(grep '\[ERROR\]' "${LOG_DIR}/backup.log" | tail -5)"
    if [[ -z "$recent_errors" ]]; then
        ok "No recent errors in log"
    else
        fail "Recent errors found in log:"
        echo "$recent_errors" | sed 's/^/      /'
    fi
else
    warn "Log file not found yet: ${LOG_DIR}/backup.log"
fi

# 6. Backup count summary
total_files="$(find "$BACKUP_ROOT" -type f -name "*.db.gz" | wc -l)"
echo ""
echo "  Total backup files : $total_files"

now_epoch="$(date '+%s')"
hourly_secs=$(( HOURLY_RETENTION_DAYS * 86400 ))
daily_secs=$(( (HOURLY_RETENTION_DAYS + DAILY_RETENTION_DAYS) * 86400 ))
max_secs=$(( MAX_RETENTION_DAYS * 86400 ))
c_hourly=0; c_daily=0; c_monthly=0; c_old=0
while IFS= read -r f; do
    fmod="$(stat -c '%Y' "$f" 2>/dev/null || stat -f '%m' "$f" 2>/dev/null)"
    age=$(( now_epoch - fmod ))
    if   (( age <= hourly_secs )); then (( c_hourly++ )) || true
    elif (( age <= daily_secs   )); then (( c_daily++  )) || true
    elif (( age <= max_secs     )); then (( c_monthly++ )) || true
    else                                 (( c_old++    )) || true
    fi
done < <(find "$BACKUP_ROOT" -type f -name "*.db.gz" 2>/dev/null)

echo "  Hourly zone (≤${HOURLY_RETENTION_DAYS}d)        : $c_hourly files"
echo "  Daily   zone (${HOURLY_RETENTION_DAYS}d–$((HOURLY_RETENTION_DAYS + DAILY_RETENTION_DAYS))d): $c_daily files"
echo "  Monthly zone (≤${MAX_RETENTION_DAYS}d)          : $c_monthly files"
[[ $c_old -gt 0 ]] && echo "  Expired (>${MAX_RETENTION_DAYS}d)          : $c_old files — run backup to purge"
echo ""
