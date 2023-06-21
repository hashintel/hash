#!/usr/bin/env bash

set -euo pipefail

yarn install --frozen-lockfile --prefer-offline --force --build-from-source
