#!/usr/bin/env bash
#MISE description="Run Clippy on the entire workspace"
cargo clippy --all-features --all-targets --workspace --no-deps
