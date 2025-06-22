#!/usr/bin/env bash

# SSM-based tunnel script for PostgreSQL access
# Uses AWS Systems Manager Session Manager for secure tunneling

# To debug, set this to 1 and tail the /tmp/ssm_tunnel_logs file.
SSM_TUNNEL_DEBUG=1

input="$(< /dev/stdin)"

# Always output to stderr for visibility in terraform logs
exec 2>&1
set -x

# Check if debugging is enabled
if [ "${SSM_TUNNEL_DEBUG:-0}" -ne 0 ]; then
  echo "=== SSM Tunnel Debug Mode Enabled ===" >&2
  env >&2
  echo "=== Input Parameters ===" >&2
  echo "$input" >&2
fi

# Parse input parameters
BASTION_INSTANCE_ID=$(jq -j '.bastion_instance_id' <<< "$input")
TUNNEL_TARGET_HOST=$(jq -j '.tunnel_target_host' <<< "$input")
TUNNEL_TARGET_PORT=$(jq -j '.tunnel_target_port' <<< "$input")
TUNNEL_MAX_ATTEMPTS=$(jq -j '.tunnel_max_attempts' <<< "$input")
LOCAL_TUNNEL_PORT=$(jq -j '.local_tunnel_port' <<< "$input")
TIMEOUT=$(jq -j '.timeout' <<< "$input")
AWS_REGION=$(jq -j '.aws_region' <<< "$input")

# Check if aws cli is available
if ! command -v aws >/dev/null 2>&1; then
    echo "Error: aws command not found. Please install AWS CLI." >&2
    exit 1
fi

# Check if nc (netcat) is available for tunnel verification
if ! command -v nc >/dev/null 2>&1; then
    echo "Error: nc (netcat) command not found. Please install netcat for tunnel verification." >&2
    exit 1
fi

# Clean up any existing SSM sessions using the same local port
pkill -f "aws ssm start-session.*localPortNumber=$LOCAL_TUNNEL_PORT" 2>/dev/null || true

# Start SSM port forwarding session in background
aws ssm start-session \
    --target "$BASTION_INSTANCE_ID" \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters "host=$TUNNEL_TARGET_HOST,portNumber=$TUNNEL_TARGET_PORT,localPortNumber=$LOCAL_TUNNEL_PORT" \
    --region "$AWS_REGION" \
    >/tmp/ssm_session_output_$LOCAL_TUNNEL_PORT.log 2>&1 &

SSM_PID=$!

# Store the PID for cleanup
echo "$SSM_PID" > "/tmp/ssm_tunnel_pid_$LOCAL_TUNNEL_PORT"

# Wait for the tunnel to be established
attempt=0
echo "=== Waiting for SSM tunnel to establish ===" >&2
while [ $attempt -lt $TUNNEL_MAX_ATTEMPTS ]; do
  echo "Attempt $((attempt + 1))/$TUNNEL_MAX_ATTEMPTS: Testing connection to 127.0.0.1:$LOCAL_TUNNEL_PORT" >&2
  if nc -z 127.0.0.1 "$LOCAL_TUNNEL_PORT" 2>/dev/null; then
    echo "=== SSM tunnel established successfully ===" >&2
    echo "{ \"host\": \"127.0.0.1\", \"port\": \"$LOCAL_TUNNEL_PORT\", \"ssm_pid\": \"$SSM_PID\" }"
    exit 0
  fi
  echo "Connection not ready, waiting 2 seconds..." >&2
  sleep 2
  attempt=$((attempt + 1))
done

# If we get here, tunnel failed
echo "Failed to establish SSM tunnel to $TUNNEL_TARGET_HOST:$TUNNEL_TARGET_PORT via $BASTION_INSTANCE_ID after $TUNNEL_MAX_ATTEMPTS attempts" >&2
kill $SSM_PID 2>/dev/null || true
rm -f "/tmp/ssm_tunnel_pid_$LOCAL_TUNNEL_PORT"
exit 1
