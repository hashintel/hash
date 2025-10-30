#!/bin/bash
set -e

# Get the project directory from environment or derive from script location
if [ -n "$CLAUDE_PROJECT_DIR" ]; then
  PROJECT_DIR="$CLAUDE_PROJECT_DIR"
else
  # Get the directory where this script is located, then go up two levels
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

export CLAUDE_PROJECT_DIR="$PROJECT_DIR"
cd "$PROJECT_DIR/.claude/hooks"
cat | npx tsx skill-activation-prompt.ts
