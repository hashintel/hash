#!/usr/bin/env bash

#MISE description="Lint TypeScript errors"

export CARGO_TERM_PROGRESS_WHEN=never
mise exec --env dev -- turbo run --continue=dependencies-successful lint:tsc
