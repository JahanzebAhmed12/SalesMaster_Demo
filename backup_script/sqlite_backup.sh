#!/usr/bin/env bash
# =============================================================================
# sqlite_backup.sh — Production-grade hourly SQLite backup with rotation
# =============================================================================
# Retention policy:
#   • All hourly backups kept for HOURLY_RETENTION_DAYS days
#   • After that, one backup per day (last of each day) for DAILY_RETENTION_DAYS
#     more days
#   • After that, one backup per month (last of each month) up to
#     MAX_RETENTION_DAYS total
#   • Backups older than MAX_RETENTION_DAYS: deleted permanently
#
# Usage: ./sqlite_backup.sh [--dry-run] [--verbose]
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

# ---------------------------------------------------------------------------
# Load configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/backup.conf"

if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "ERROR: Config file not found: $CONFIG_FILE" >&2
    exit 1
fi

# shellcheck source=backup.conf
source "$CONFIG_FILE"

# ---------------------------------------------------------------------------
# Parse CLI flags
# ---------------------------------------------------------------------------
DRY_RUN=false
VERBOSE=false

for arg in "$@"; do
    case $arg in
        --dry-run) DRY_RUN=true ;;
        --verbose) VERBOSE=true ;;
        *) echo "Unknown argument: $arg" >&2; exit 1 ;;
    esac
done

# ---------------------------------------------------------------------------
# Resolve script directory (handles symlinks)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_FILE="${LOG_DIR}/backup.log"
mkdir -p "$LOG_DIR"

log() {
    local level="$1"; shift
    local msg="$*"
    local ts
    ts="$(date '+%Y-%m-%d %H:%M:%S')"
    local line="[$ts] [$level] $msg"
    echo "$line" >> "$LOG_FILE"
    if [[ "$VERBOSE" == true ]] || [[ "$level" == "ERROR" ]] || [[ "$level" == "WARN" ]]; then
        echo "$line" >&2
    fi
}

log_info()  { log "INFO"  "$@"; }
log_warn()  { log "WARN"  "$@"; }
log_error() { log "ERROR" "$@"; }
log_debug() { [[ "$VERBOSE" == true ]] && log "DEBUG" "$@" || true; }

# ---------------------------------------------------------------------------
# Trap for cleanup and error reporting
# ---------------------------------------------------------------------------
LOCK_FILE="${LOG_DIR}/backup.lock"
TEMP_BACKUP=""

cleanup() {
    local exit_code=$?
    [[ -n "$TEMP_BACKUP" && -f "$TEMP_BACKUP" ]] && rm -f "$TEMP_BACKUP"
    rm -f "$LOCK_FILE"
    if [[ $exit_code -ne 0 ]]; then
        log_error "Script exited with code $exit_code"
        send_alert "SQLite backup FAILED on $(hostname) at $(date)" \
                   "Exit code: $exit_code. Check $LOG_FILE for details."
    fi
    exit $exit_code
}
trap cleanup EXIT
trap 'log_error "Caught signal, aborting."; exit 130' INT TERM

# ---------------------------------------------------------------------------
# Prevent concurrent runs via lock file
# ---------------------------------------------------------------------------
acquire_lock() {
    if [[ -f "$LOCK_FILE" ]]; then
        local pid
        pid="$(cat "$LOCK_FILE" 2>/dev/null || echo '')"
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            log_error "Another backup is running (PID $pid). Exiting."
            exit 1
        else
            log_warn "Stale lock file found (PID $pid). Removing."
            rm -f "$LOCK_FILE"
        fi
    fi
    echo $$ > "$LOCK_FILE"
    log_debug "Lock acquired (PID $$)"
}

# ---------------------------------------------------------------------------
# Alert / notification (e-mail via sendmail, or extend for Slack/PagerDuty)
# ---------------------------------------------------------------------------
send_alert() {
    local subject="$1"
    local body="${2:-}"

    if [[ "${ALERT_EMAIL:-}" == "" ]]; then
        log_debug "No ALERT_EMAIL configured; skipping alert."
        return 0
    fi

    if command -v sendmail &>/dev/null; then
        {
            echo "To: $ALERT_EMAIL"
            echo "Subject: $subject"
            echo ""
            echo "$body"
        } | sendmail -t 2>/dev/null || log_warn "sendmail failed."
    else
        log_warn "sendmail not found; cannot send alert: $subject"
    fi
}

# ---------------------------------------------------------------------------
# Validate environment
# ---------------------------------------------------------------------------
validate_env() {
    log_info "Validating environment..."

    # Required binaries
    local bins=(sqlite3 gzip sha256sum date find)
    for bin in "${bins[@]}"; do
        command -v "$bin" &>/dev/null || { log_error "Missing binary: $bin"; exit 1; }
    done

    # Source DB
    if [[ ! -f "$DB_PATH" ]]; then
        log_error "SQLite DB not found: $DB_PATH"
        exit 1
    fi

    # Backup root
    mkdir -p "$BACKUP_ROOT"
    if [[ ! -w "$BACKUP_ROOT" ]]; then
        log_error "Backup dir not writable: $BACKUP_ROOT"
        exit 1
    fi

    log_info "Environment OK."
}

# ---------------------------------------------------------------------------
# Perform the actual backup using SQLite's .backup command (online-safe)
# ---------------------------------------------------------------------------
do_backup() {
    local now
    now="$(date '+%Y-%m-%d_%H-%M-%S')"
    local year_month
    year_month="$(date '+%Y/%m')"
    local dest_dir="${BACKUP_ROOT}/${year_month}"

    mkdir -p "$dest_dir"

    local db_name
    db_name="$(basename "$DB_PATH" .db)"

    local final_name="${db_name}_${now}.db.gz"
    local final_path="${dest_dir}/${final_name}"
    local checksum_path="${final_path}.sha256"

    TEMP_BACKUP="$(mktemp "${dest_dir}/.tmp_backup_XXXXXX.db")"

    log_info "Starting backup: $DB_PATH → $final_path"

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would write backup to $final_path"
        rm -f "$TEMP_BACKUP"; TEMP_BACKUP=""
        return 0
    fi

    # Use SQLite's online backup API — safe while the DB is in use
    if ! sqlite3 "$DB_PATH" ".backup '$TEMP_BACKUP'" 2>>"$LOG_FILE"; then
        log_error "sqlite3 .backup failed"
        exit 1
    fi

    # Verify the backup is a valid SQLite file
    if ! sqlite3 "$TEMP_BACKUP" "PRAGMA integrity_check;" 2>>"$LOG_FILE" | grep -q "^ok$"; then
        log_error "Integrity check failed on backup copy"
        exit 1
    fi

    # VACUUM the copy before compressing: .backup keeps the whole file including
    # free pages, so compacting first can dramatically reduce backup size.
    if ! sqlite3 "$TEMP_BACKUP" "VACUUM;" 2>>"$LOG_FILE"; then
        log_error "VACUUM failed on backup copy"
        exit 1
    fi

    # Compress
    gzip -"${GZIP_LEVEL:-6}" -c "$TEMP_BACKUP" > "$final_path"
    rm -f "$TEMP_BACKUP"; TEMP_BACKUP=""

    # Checksum
    sha256sum "$final_path" | awk '{print $1}' > "$checksum_path"

    local size
    size="$(du -sh "$final_path" | cut -f1)"
    log_info "Backup complete: $final_path ($size)"
    log_info "Checksum: $(cat "$checksum_path")"

    # Symlink: latest backup
    local latest_link="${BACKUP_ROOT}/latest.db.gz"
    ln -sf "$final_path" "$latest_link"

    return 0
}

# ---------------------------------------------------------------------------
# Rotation: apply retention policy
#
#   Zone A — keep all hourly backups that are ≤ HOURLY_RETENTION_DAYS old
#   Zone B — for files older than HOURLY_RETENTION_DAYS but ≤
#            (HOURLY_RETENTION_DAYS + DAILY_RETENTION_DAYS): keep only the
#             LAST backup of each calendar day
#   Zone C — for files older than that but ≤ MAX_RETENTION_DAYS: keep only the
#             LAST backup of each calendar month
#   Zone D — delete everything older than MAX_RETENTION_DAYS
# ---------------------------------------------------------------------------
rotate_backups() {
    log_info "Running retention / rotation..."

    local now_epoch
    now_epoch="$(date '+%s')"

    # Seconds thresholds
    local hourly_secs=$(( HOURLY_RETENTION_DAYS * 86400 ))
    local daily_secs=$(( (HOURLY_RETENTION_DAYS + DAILY_RETENTION_DAYS) * 86400 ))
    local max_secs=$(( MAX_RETENTION_DAYS * 86400 ))

    # Collect all backup files (newest first within each day for dedup logic)
    mapfile -t all_files < <(find "$BACKUP_ROOT" -type f -name "*.db.gz" | sort -r)

    declare -A day_kept   # tracks which days already have a keeper in zone B
    declare -A month_kept # tracks which months already have a keeper in zone C

    local deleted=0 kept_hourly=0 kept_daily=0 pruned_daily=0 kept_monthly=0 pruned_monthly=0

    for f in "${all_files[@]}"; do
        local fmod
        fmod="$(stat -c '%Y' "$f" 2>/dev/null || stat -f '%m' "$f" 2>/dev/null)"
        local age_secs=$(( now_epoch - fmod ))

        if (( age_secs <= hourly_secs )); then
            # Zone A — keep all hourly
            log_debug "KEEP (hourly): $f"
            (( kept_hourly++ )) || true

        elif (( age_secs <= daily_secs )); then
            # Zone B — one per day, keep newest
            local file_day
            file_day="$(date -d "@$fmod" '+%Y-%m-%d' 2>/dev/null \
                        || date -r "$fmod" '+%Y-%m-%d' 2>/dev/null)"

            if [[ -z "${day_kept[$file_day]+_}" ]]; then
                # First (newest) file for this day — keep it
                day_kept[$file_day]=1
                log_debug "KEEP (daily representative): $f"
                (( kept_daily++ )) || true
            else
                # Older duplicate for the same day — remove
                log_info "PRUNE (daily dedup): $f"
                if [[ "$DRY_RUN" == false ]]; then
                    rm -f "$f" "${f}.sha256"
                fi
                (( pruned_daily++ )) || true
            fi

        elif (( age_secs <= max_secs )); then
            # Zone C — one per month, keep newest
            local file_month
            file_month="$(date -d "@$fmod" '+%Y-%m' 2>/dev/null \
                          || date -r "$fmod" '+%Y-%m' 2>/dev/null)"

            if [[ -z "${month_kept[$file_month]+_}" ]]; then
                # First (newest) file for this month — keep it
                month_kept[$file_month]=1
                log_debug "KEEP (monthly representative): $f"
                (( kept_monthly++ )) || true
            else
                # Older duplicate for the same month — remove
                log_info "PRUNE (monthly dedup): $f"
                if [[ "$DRY_RUN" == false ]]; then
                    rm -f "$f" "${f}.sha256"
                fi
                (( pruned_monthly++ )) || true
            fi

        else
            # Zone D — older than max retention, delete
            log_info "DELETE (expired): $f"
            if [[ "$DRY_RUN" == false ]]; then
                rm -f "$f" "${f}.sha256"
            fi
            (( deleted++ )) || true
        fi
    done

    # Clean up empty subdirectories
    if [[ "$DRY_RUN" == false ]]; then
        find "$BACKUP_ROOT" -mindepth 1 -type d -empty -delete 2>/dev/null || true
    fi

    log_info "Rotation summary: kept_hourly=$kept_hourly, kept_daily=$kept_daily, pruned_daily=$pruned_daily, kept_monthly=$kept_monthly, pruned_monthly=$pruned_monthly, deleted_expired=$deleted"
}

# ---------------------------------------------------------------------------
# Disk space check
# ---------------------------------------------------------------------------
check_disk_space() {
    local avail_kb
    avail_kb="$(df -Pk "$BACKUP_ROOT" | awk 'NR==2{print $4}')"
    local avail_mb=$(( avail_kb / 1024 ))

    if (( avail_mb < MIN_FREE_MB )); then
        log_warn "Low disk space: ${avail_mb}MB free (threshold: ${MIN_FREE_MB}MB)"
        send_alert "SQLite backup WARNING: low disk space on $(hostname)" \
                   "Only ${avail_mb}MB free in $BACKUP_ROOT. Threshold is ${MIN_FREE_MB}MB."
    else
        log_debug "Disk space OK: ${avail_mb}MB free"
    fi
}

# ---------------------------------------------------------------------------
# Write backup report / stats
# ---------------------------------------------------------------------------
write_report() {
    local report="${LOG_DIR}/backup_report.txt"
    {
        echo "======================================="
        echo " SQLite Backup Report"
        echo " Generated: $(date)"
        echo "======================================="
        echo ""
        echo "DB Source   : $DB_PATH"
        echo "Backup Root : $BACKUP_ROOT"
        echo ""
        echo "--- File counts by age ---"
        local now_epoch; now_epoch="$(date '+%s')"
        local hourly_secs=$(( HOURLY_RETENTION_DAYS * 86400 ))
        local daily_secs=$(( (HOURLY_RETENTION_DAYS + DAILY_RETENTION_DAYS) * 86400 ))
        local max_secs=$(( MAX_RETENTION_DAYS * 86400 ))
        local c_hourly=0 c_daily=0 c_monthly=0
        while IFS= read -r f; do
            local fmod; fmod="$(stat -c '%Y' "$f" 2>/dev/null || stat -f '%m' "$f" 2>/dev/null)"
            local age=$(( now_epoch - fmod ))
            if (( age <= hourly_secs )); then (( c_hourly++ )) || true
            elif (( age <= daily_secs )); then (( c_daily++ )) || true
            elif (( age <= max_secs )); then (( c_monthly++ )) || true
            fi
        done < <(find "$BACKUP_ROOT" -type f -name "*.db.gz")
        echo "  Hourly zone (≤${HOURLY_RETENTION_DAYS}d): $c_hourly files"
        echo "  Daily   zone (>${HOURLY_RETENTION_DAYS}d–≤$((HOURLY_RETENTION_DAYS + DAILY_RETENTION_DAYS))d): $c_daily files"
        echo "  Monthly zone (>$((HOURLY_RETENTION_DAYS + DAILY_RETENTION_DAYS))d–≤${MAX_RETENTION_DAYS}d): $c_monthly files"
        echo ""
        echo "--- Disk usage ---"
        du -sh "$BACKUP_ROOT" 2>/dev/null || true
        echo ""
        echo "--- 10 most recent backups ---"
        find "$BACKUP_ROOT" -type f -name "*.db.gz" | sort -r | head -10
        echo ""
        echo "Latest symlink → $(readlink -f "${BACKUP_ROOT}/latest.db.gz" 2>/dev/null || echo 'none')"
    } > "$report"
    log_info "Report written: $report"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    log_info "======== Backup job started (PID $$) ========"
    [[ "$DRY_RUN" == true ]] && log_warn "DRY-RUN mode enabled — no files will be written or deleted."

    acquire_lock
    validate_env
    check_disk_space
    do_backup
    rotate_backups
    write_report

    log_info "======== Backup job finished OK ========"
}

main "$@"
