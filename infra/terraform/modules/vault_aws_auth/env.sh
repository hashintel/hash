#!/usr/bin/env bash

cat << EOF
{
  "in_ci": "${CI:-false}"
}
EOF
