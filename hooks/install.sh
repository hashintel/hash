#!/usr/env/bin bash
# shellcheck shell=bash

# Install all hooks in this directory into ../.git/hooks.

# @todo: get this script to work on Windows
os=$(uname | tr '[:upper:]' '[:lower:]');
if grep -qE 'windows' <<< "$os"; then
  echo "Windows is not supported. Please install the hooks manually"
  exit 1;
fi;


dir=$(cd "$(dirname "$0")" || exit; pwd -P);

for f in "$dir"/*
do
  if grep -vqE 'install.sh' <<< "$f"; then
    chmod u+x "$f";
    filename=$(basename "$f");
    linkpath="$dir/../.git/hooks/$filename";
    ln -fs "$f" "$linkpath";
    echo "Installed hook .git/hooks/$filename";
  fi;
done;
