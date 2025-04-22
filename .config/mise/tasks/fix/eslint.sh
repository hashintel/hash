#!/usr/bin/env bash

#MISE description="Fix ESLint errors"

export CARGO_TERM_PROGRESS_WHEN=never
mise exec --env dev -- turbo run --continue=dependencies-successful fix:eslint
