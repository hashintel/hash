#!/usr/bin/env bash

# To debug, set this to 1 and tail the /tmp/tunnel_logs file.
# Make sure `jq` is installed on the system.
TUNNEL_DEBUG=0

input="$(< /dev/stdin)"

if [ -n "$TUNNEL_DEBUG" ] ; then
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
LOCAL_TUNNEL_PORT=$(jq -j '.local_tunnel_port' <<< "$input")
TIMEOUT=$(jq -j '.timeout' <<< "$input")

echo "{ \"host\": \"127.0.0.1\",  \"port\": \"$LOCAL_TUNNEL_PORT\" }"

# To allow the private key file to be read
TEMP=$(mktemp -u)
echo "$SSH_PRIVATE_KEY" > "$TEMP"
chmod 600 "$TEMP"

# SSH tunnel with auto closing for the given timeout
nohup ssh -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=no \
  -i "$TEMP" -tf \
  -M -S terraform_ssh_tunnel \
  -L "$LOCAL_TUNNEL_PORT:$TUNNEL_TARGET_HOST:$TUNNEL_TARGET_PORT" \
  -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" sleep "$TIMEOUT" </dev/null >/dev/null 2>&1 & 

# Sleep a little to let the SSH tunnel estabhlish
sleep 5

# PPID is an internal var. Within `nohup` it would change, so we store it up front.
# When the parent exits (terraform), we kill the child SSH tunnel.
SH_PPID=$(ps -o ppid= -p $PPID)
nohup sh -c "while kill -0 $SH_PPID 2> /dev/null; do sleep 1; done && ssh -S terraform_ssh_tunnel -O exit $SSH_USER@$SSH_HOST" <&- >&- &

exit 0
