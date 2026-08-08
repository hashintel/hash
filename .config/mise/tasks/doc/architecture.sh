#!/usr/bin/env bash

#MISE description="Regenerate the Petrinaut architecture bundle from in-code annotations"

export CARGO_TERM_PROGRESS_WHEN=never
mise exec --env dev -- turbo run doc:architecture
