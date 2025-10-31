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

# Pass all arguments to the TypeScript script
# If --validate is passed, don't try to read from stdin
if [[ "$*" == *"--validate"* ]]; then
  npx tsx skill-activation-prompt.ts "$@"
else
  cat | npx tsx skill-activation-prompt.ts "$@"
fi
