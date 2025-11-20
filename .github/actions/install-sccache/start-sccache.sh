#!/usr/bin/env bash
set -euo pipefail

# Configuration
readonly DEFAULT_PORT=4226
readonly MAX_ATTEMPTS=3
readonly RETRY_DELAY=2
readonly PORT_RANGE_START=4226
readonly PORT_RANGE_END=65535
readonly MAX_PORT_TRIES=100

# Logging functions
log_info() { echo "$*"; }
log_notice() { echo "::notice::$*"; }
log_error() { echo "::error::$*"; }
log_warning() { echo "::warning::$*"; }

# Check if a port is available using ss (always available in GitHub Actions)
is_port_available() {
    local port=$1

    # Check if port is listening (both IPv4 and IPv6)
    # Returns 0 (success) if port is available, 1 if in use
    ! ss -ltn "sport = :$port" 2>/dev/null | grep -q ":$port"
}

# Find an available port
get_available_port() {
    local port
    local tries=0

    while ((tries < MAX_PORT_TRIES)); do
        port=$((PORT_RANGE_START + RANDOM % (PORT_RANGE_END - PORT_RANGE_START + 1)))

        if is_port_available "$port"; then
            echo "$port"
            return 0
        fi

        ((tries++))
    done

    log_error "Failed to find available port after $MAX_PORT_TRIES attempts"
    return 1
}

# Try to start sccache with a given port
try_start_sccache() {
    local port=$1
    local output

    log_info "Attempting to start sccache server on port $port..."

    export SCCACHE_SERVER_PORT=$port

    if [[ "${DRY_RUN:-false}" =~ ^(true|1|yes)$ ]]; then
        log_info "[DRY RUN] Would execute: sccache --start-server"
        if ((port == DEFAULT_PORT)); then
            log_info "[DRY RUN] Simulating failure on default port"
            return 1
        else
            log_info "[DRY RUN] Simulating success on port $port"
            return 0
        fi
    fi

    # Capture output for debugging
    if output=$(sccache --start-server 2>&1); then
        log_info "Successfully started sccache server on port $port"
        return 0
    else
        log_warning "Failed to start sccache server on port $port"
        log_info "Output: $output"

        # Unset the port variable if we set it
        if ((port != DEFAULT_PORT)); then
            unset SCCACHE_SERVER_PORT
        fi
        return 1
    fi
}

main() {
    local port=$DEFAULT_PORT
    local attempt=1

    log_info "Starting sccache server with up to $MAX_ATTEMPTS attempts"

    while ((attempt <= MAX_ATTEMPTS)); do
        log_info "Attempt $attempt of $MAX_ATTEMPTS..."

        if try_start_sccache "$port"; then
            if [[ "${DRY_RUN:-false}" =~ ^(true|1|yes)$ ]]; then
                log_info "[DRY RUN] Would set SCCACHE_SERVER_PORT=$port in GITHUB_ENV"
            else
                echo "SCCACHE_SERVER_PORT=$port" >>"$GITHUB_ENV"
                log_info "Set SCCACHE_SERVER_PORT=$port in GITHUB_ENV"
            fi

            log_notice "sccache server started successfully on port $port"
            exit 0
        fi

        # Don't try to find a new port if we've exhausted attempts
        if ((attempt >= MAX_ATTEMPTS)); then
            break
        fi

        # Get an available port for next attempt
        if ! port=$(get_available_port); then
            log_error "Aborting: Could not find an available port for sccache server"
            exit 1
        fi

        log_info "Will retry with port $port after ${RETRY_DELAY}s..."
        sleep "$RETRY_DELAY"

        ((attempt++))
    done

    # Cleanup after final failure
    log_error "Failed to start sccache server after $MAX_ATTEMPTS attempts"

    # Try to show error log if it exists
    if [[ -f /tmp/sccache.log ]]; then
        log_error "sccache error log contents:"
        cat /tmp/sccache.log >&2
    fi

    exit 1
}

# Run main function
main "$@"
