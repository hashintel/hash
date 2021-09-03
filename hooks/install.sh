#!/usr/env/bin bash
# shellcheck shell=bash

# Install all hooks in this directory into ../.git/hooks.

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
