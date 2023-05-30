#!/usr/bin/env bash

set -eo pipefail

WORKSPACE=$(terraform workspace show)
REGION=$(terraform output -raw region_short)

CURR_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
[ -d "$CURR_DIR" ] || { echo "FATAL: no current dir (maybe running in zsh?)";  exit 1; }

echo "What project are you connecting to?"
read PROJECT

# Get one DNS name and trim the whitespace
PUBLIC_HOST=$(aws ec2 describe-instances --region us-east-1 --filters "Name=tag:Name,Values=h-$PROJECT-$WORKSPACE-$REGION-bastion" \
  --query "Reservations[].Instances[].PublicDnsName" --output text | head -n1 | awk '{$1=$1};1')


RED="\033[0;31m"
CLEAR="\033[0m"
printf "Connecting to bastion host in ${RED}%s${CLEAR}, host=%s...\n" "$WORKSPACE" "$PUBLIC_HOST"
# shellcheck disable=SC2068
ssh -i "$CURR_DIR/h-$PROJECT-$WORKSPACE-$REGION-bastionkey.pem" "ec2-user@$PUBLIC_HOST" $@
