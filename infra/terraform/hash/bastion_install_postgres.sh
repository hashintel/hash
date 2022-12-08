#!/usr/bin/env bash


CURR_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
[ -d "$CURR_DIR" ] || { echo "FATAL: no current dir (maybe running in zsh?)";  exit 1; }

ssh_escape() { echo "bash -c $(printf "%q" "$(declare -f "$@"); $1 $2")"; };

rhel_install_postgres() {
  set -eou pipefail
  MAJOR_MINOR=${1:-'13.7'}

  # Split at dot
  IFS='.' read -r MAJOR _MINOR <<< "$MAJOR_MINOR"
  MAJOR=${MAJOR:-'13'}

  LIB="postgresql$MAJOR-libs-$MAJOR_MINOR-1PGDG.rhel7.x86_64.rpm"
  EXE="postgresql$MAJOR-$MAJOR_MINOR-1PGDG.rhel7.x86_64.rpm"

  wget -nv "https://download.postgresql.org/pub/repos/yum/$MAJOR/redhat/rhel-7-x86_64/$LIB"
  wget -nv "https://download.postgresql.org/pub/repos/yum/$MAJOR/redhat/rhel-7-x86_64/$EXE"

  sudo yum clean all
  sudo rpm -ivh "$LIB" && rm "$LIB"
  sudo rpm -ivh "$EXE" && rm "$EXE"
}

"$CURR_DIR/ssh_bastion.sh" "$(ssh_escape rhel_install_postgres "$1")"

echo ""
echo "------------------------------------"
echo "PSQL installed on bastion host!"
