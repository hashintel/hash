#!/usr/bin/env bash
#MISE description="Fix Clippy on the entire workspace"
cargo clippy --all-features --all-targets --workspace --no-deps --fix
