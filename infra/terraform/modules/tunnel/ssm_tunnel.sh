#!/usr/bin/env bash

# SSM-based tunnel script for PostgreSQL access
# Uses AWS Systems Manager Session Manager for secure tunneling

input="$(< /dev/stdin)"

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
echo "AWS CLI found: $(command -v aws)" >&2

# Check if nc (netcat) is available for tunnel verification
if ! command -v nc >/dev/null 2>&1; then
    echo "Error: nc (netcat) command not found. Please install netcat for tunnel verification." >&2
    exit 1
fi
echo "Netcat found: $(command -v nc)" >&2

# Clean up any existing SSM sessions using the same local port
pkill -f "aws ssm start-session.*localPortNumber=$LOCAL_TUNNEL_PORT" 2>/dev/null || true

# Start SSM port forwarding session in background
echo "=== Starting SSM session ===" >&2
echo "Target: $BASTION_INSTANCE_ID" >&2
echo "Tunnel: $TUNNEL_TARGET_HOST:$TUNNEL_TARGET_PORT -> 127.0.0.1:$LOCAL_TUNNEL_PORT" >&2
echo "Region: $AWS_REGION" >&2

aws ssm start-session \
    --target "$BASTION_INSTANCE_ID" \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters "host=$TUNNEL_TARGET_HOST,portNumber=$TUNNEL_TARGET_PORT,localPortNumber=$LOCAL_TUNNEL_PORT" \
    --region "$AWS_REGION" \
    >/tmp/ssm_session_output_$LOCAL_TUNNEL_PORT.log 2>&1 &

SSM_PID=$!

# Store the PID for cleanup
echo "$SSM_PID" > "/tmp/ssm_tunnel_pid_$LOCAL_TUNNEL_PORT"

# Wait for the tunnel to be established with exponential backoff
# SSM port forwarding needs time after session establishment, especially in CI environments
attempt=0
echo "=== Waiting for SSM tunnel to establish ===" >&2
while [ $attempt -lt $TUNNEL_MAX_ATTEMPTS ]; do
  echo "Attempt $((attempt + 1))/$TUNNEL_MAX_ATTEMPTS: Testing connection to 127.0.0.1:$LOCAL_TUNNEL_PORT" >&2
  if nc -z 127.0.0.1 "$LOCAL_TUNNEL_PORT" 2>/dev/null; then
    echo "=== SSM tunnel established successfully ===" >&2
    echo "{ \"host\": \"127.0.0.1\", \"port\": \"$LOCAL_TUNNEL_PORT\", \"ssm_pid\": \"$SSM_PID\" }"
    exit 0
  fi
  
  # Exponential backoff: 1s, 2s, 4s, 8s, then 8s for remaining attempts
  # This gives SSM more time on later attempts when AWS might be slower
  delay=$((attempt < 3 ? 2 ** attempt : 8))
  [ $delay -eq 0 ] && delay=1
  
  echo "Connection not ready, waiting ${delay} seconds..." >&2
  sleep $delay
  attempt=$((attempt + 1))
done

# If we get here, tunnel failed
echo "=== SSM Session Output ===" >&2
cat "/tmp/ssm_session_output_$LOCAL_TUNNEL_PORT.log" >&2 2>/dev/null || echo "No session log found" >&2
echo "=== End SSM Session Output ===" >&2

echo "Failed to establish SSM tunnel to $TUNNEL_TARGET_HOST:$TUNNEL_TARGET_PORT via $BASTION_INSTANCE_ID after $TUNNEL_MAX_ATTEMPTS attempts" >&2
kill $SSM_PID 2>/dev/null || true
rm -f "/tmp/ssm_tunnel_pid_$LOCAL_TUNNEL_PORT"
exit 1
