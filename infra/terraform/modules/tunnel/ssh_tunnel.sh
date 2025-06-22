#!/usr/bin/env bash

# To debug, set this to 1 and tail the /tmp/tunnel_logs file.
# Make sure `jq` is installed on the system.
TUNNEL_DEBUG=0

input="$(< /dev/stdin)"

# Check if debugging is enabled. The fallback `${TUNNEL_DEBUG:-0}` ensures a default value of 0
# if `TUNNEL_DEBUG` is unset. A non-zero value enables debugging.
if [ "${TUNNEL_DEBUG:-0}" -ne 0 ]; then
  exec 2>/tmp/tunnel_logs
  set -x
  env >&2
fi

SSH_HOST=$(jq -j '.ssh_host' <<< "$input")
SSH_PORT=$(jq -j '.ssh_port' <<< "$input")
SSH_USER=$(jq -j '.ssh_user' <<< "$input")
SSH_PRIVATE_KEY=$(jq -j '.ssh_private_key' <<< "$input")
TUNNEL_TARGET_HOST=$(jq -j '.tunnel_target_host' <<< "$input")
TUNNEL_TARGET_PORT=$(jq -j '.tunnel_target_port' <<< "$input")
TUNNEL_MAX_ATTEMPTS=$(jq -j '.tunnel_max_attempts' <<< "$input")
LOCAL_TUNNEL_PORT=$(jq -j '.local_tunnel_port' <<< "$input")
TIMEOUT=$(jq -j '.timeout' <<< "$input")

# Check if nc (netcat) is available for tunnel verification
if ! command -v nc >/dev/null 2>&1; then
    echo "Error: nc (netcat) command not found. Please install netcat for tunnel verification." >&2
    exit 1
fi

# To allow the private key file to be read
TEMP=$(mktemp)
trap 'rm -f "$TEMP"' EXIT SIGINT SIGTERM
echo "$SSH_PRIVATE_KEY" > "$TEMP"
chmod 600 "$TEMP"

# Clean up any existing tunnels using the same control socket and port
pkill -f "ssh.*-M -S terraform_ssh_tunnel.*-L $LOCAL_TUNNEL_PORT:" 2>/dev/null || true

# Start SSH tunnel in background
ssh -o ExitOnForwardFailure=yes \
    -o StrictHostKeyChecking=no \
    -o BatchMode=yes \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -i "$TEMP" \
    -f -N \
    -M -S terraform_ssh_tunnel \
    -L "$LOCAL_TUNNEL_PORT:$TUNNEL_TARGET_HOST:$TUNNEL_TARGET_PORT" \
    -p "$SSH_PORT" "$SSH_USER@$SSH_HOST"

# Verify the tunnel is working
attempt=0
while [ $attempt -lt $TUNNEL_MAX_ATTEMPTS ]; do
  if nc -z 127.0.0.1 "$LOCAL_TUNNEL_PORT" 2>/dev/null; then
    echo "{ \"host\": \"127.0.0.1\",  \"port\": \"$LOCAL_TUNNEL_PORT\" }"
    exit 0
  fi
  sleep 1
  attempt=$((attempt + 1))
done

# If we get here, tunnel failed
echo "Failed to establish tunnel to $TUNNEL_TARGET_HOST:$TUNNEL_TARGET_PORT via $SSH_HOST after $TUNNEL_MAX_ATTEMPTS attempts" >&2
ssh -S terraform_ssh_tunnel -O exit "$SSH_USER@$SSH_HOST" 2>/dev/null || true
exit 1
