#!/usr/bin/env bash

RED="\033[0;31m"
GREEN="\033[0;32m"
CLEAR="\033[0m"

usage() {
  echo -n "restore_db_snapshot snapshot_identifier new_instance_name

Recovers a DB snapshot to a new instance, but keeps subnet/SG settings.

 Options:
  --public        Flag to set the RDS instance to be publicly accessible
  --workspace     Workspace to use
  --dry           Dry run, don't actually restore the snapshot
  -h, --help      Display this help and exit
"
}

function confirm_action() {
  read -rp $'\033[1;96m'"$1"$'\033[0m'" [y/n] " yn
    case $yn in
        [Yy]* ) ;;
        [Nn]* ) exit;;
        * ) echo "Please answer y or n.";;
    esac
  echo ""
}

CURR_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
[ -d "$CURR_DIR" ] || { echo "FATAL: no current dir (maybe running in zsh?)";  exit 1; }

WORKSPACE_OVERRIDE=false
WORKSPACE=$(terraform workspace show)
SNAPSHOT_IDENTIFIER=''
NEW_INSTANCE_NAME=''

# Parse command line arguments
while [[ $# -gt 0 ]]
do
  key="$1"
  case $key in
    -h|--help)
      usage
      exit 0
      ;;
    --dry)
      DRY_RUN=true
      shift
      ;;
    --public)
      PUBLIC=true
      shift
      ;;
    --workspace)
      WORKSPACE_OVERRIDE=true
      WORKSPACE="$2"
      shift
      shift
      ;;
    *)
      SNAPSHOT_IDENTIFIER="$1"
      NEW_INSTANCE_NAME="$2"
      shift
      shift
      ;;
  esac
done

if [[ -z "$SNAPSHOT_IDENTIFIER" ]] || [[ -z "$NEW_INSTANCE_NAME" ]]
then
  echo -e "${RED}ERROR: Snapshot identifier and new instance name are required.${CLEAR}"
  usage
  exit 1
fi

set -e
set -o pipefail

echo -e "${GREEN}Restoring DB snapshot $SNAPSHOT_IDENTIFIER to new instance $NEW_INSTANCE_NAME.${CLEAR}"

if [[ "$WORKSPACE_OVERRIDE" == true ]]
then
  echo -e "${GREEN}Using workspace $WORKSPACE.${CLEAR}"
  terraform workspace select "$WORKSPACE"
fi

SUBNET_GROUP="h-hash-$WORKSPACE-pgsubnetgrp"
PARAMTER_GROUP="h-hash-$WORKSPACE-pgparamgrp"
SECURITY_GROUP=$(aws rds describe-db-instances --filter "Name=db-instance-id,Values=h-hash-$WORKSPACE-pg" --query "DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId" --output text)

if [[ "$DRY_RUN" == true ]]
then
  echo -e "${GREEN}Dry run, not actually restoring the snapshot.${CLEAR}"
fi
  
aws rds restore-db-instance-from-db-snapshot \
	--db-snapshot-identifier "$SNAPSHOT_IDENTIFIER" \
	--db-instance-identifier "$NEW_INSTANCE_NAME" \
  --db-subnet-group-name "$SUBNET_GROUP" \
  --db-parameter-group-name "$PARAMTER_GROUP" \
  --vpc-security-group-ids "$SECURITY_GROUP" \
  --no-cli-pager \
  ${PUBLIC:+--publicly-accessible} ${DRY_RUN:+--generate-cli-skeleton "output"}