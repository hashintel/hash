#!/usr/bin/env bash

# The input is the URL to read the file from, e.g.: https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1
# The output is the file to write to, e.g.: ./data_types/boolean/1.json
DIRECTORY=${1#*types/}
DIRECTORY=${DIRECTORY%/v/*}
DIRECTORY=${DIRECTORY//-/_}

VERSION=${1#*types/*/*/v/}
VERSION=${VERSION%/*}

echo "Creating directory $DIRECTORY"
mkdir -p "$DIRECTORY"
echo "Loading type from $INPUT to $DIRECTORY/$VERSION.json"
wget -O "$DIRECTORY/$VERSION.json" "$1"
