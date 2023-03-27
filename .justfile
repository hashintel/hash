#!/usr/bin/env just --justfile

set dotenv-load := true

repo := `git rev-parse --show-toplevel`
profile := env_var_or_default('PROFILE', "dev")
github-event-name := env_var_or_default('GITHUB_EVENT_NAME', "none")


######################################################################
## Helper to print a message when calling `just`
######################################################################
[private]
default:
  @echo "Usage: just <recipe>"
  @just list-repo-recipes
  @echo "For further information, run 'just --help'"

# List recipes in this file and from the calling directory
[no-cd]
[private]
usage:
  @echo "Usage: just <recipe>"
  @just list-local-recipes
  @just list-repo-recipes
  @echo "For further information, run 'just --help'"

[no-cd]
[private]
list-local-recipes:
  @echo '\nAvailable recipes:'
  @just --list --unsorted --list-heading ''

[private]
list-repo-recipes:
  @echo "\nRepository recipes:"
  @just --list --unsorted --list-heading ''


######################################################################
## Helper to run a global command
######################################################################

# Runs yarn in the repository root
[private]
yarn *args:
  yarn {{args}}


######################################################################
## Helper to run a command on an environmental condition
######################################################################

# Runs the provided command if `PROFILE` starts with `"dev"`
[private]
[no-cd]
in-dev +command:
  #!/usr/bin/env bash
  set -euo pipefail
  if [[ {{ profile }} =~ dev.* ]]; then
    echo "{{command}}" >&2
    {{command}}
  fi

# Runs the provided command if in a pull request
[private]
[no-cd]
in-pr +command:
  #!/usr/bin/env bash
  set -euo pipefail
  if [[ {{ github-event-name }} = pull_request ]]; then
    echo "{{command}}" >&2
    {{command}}
  fi

# Runs the provided command if not in a pull request
[private]
[no-cd]
not-in-pr +command:
  #!/usr/bin/env bash
  set -euo pipefail
  if [[ {{ github-event-name }} != pull_request ]]; then
    echo "{{command}}" >&2
    {{command}}
  fi


######################################################################
## Install scripts
######################################################################

[private]
install-cargo-tool tool install version:
  @`{{tool}} --version | grep -q "{{version}}" || cargo install "{{install}}" --version "{{version}}" --locked --force`

[private]
install-cargo-hack:
  @just install-cargo-tool 'cargo hack' cargo-hack 0.5.26

[private]
install-cargo-nextest:
  @just install-cargo-tool 'cargo nextest' cargo-nextest 0.9.37

[private]
install-rust-script:
  @just install-cargo-tool 'rust-script' rust-script 0.23.0

[private]
install-llvm-cov:
  @just install-cargo-tool 'cargo llvm-cov' cargo-llvm-cov 0.5.9

[private]
install-cargo-insta:
  @just install-cargo-tool 'cargo insta' cargo-insta 1.18.2


######################################################################
## Predefined commands
######################################################################

# Updates the compiler warnings in the `.cargo/config.toml` file.
[private]
[no-cd]
lint-toml mode:
  @rust-script "{{repo}}/.github/scripts/rust/lint.rs" {{mode}}

# Runs all linting commands and fails if the CI would fail
[no-cd]
lint:
  @just format --check
  @just clippy -- -D warnings
  @RUSTDOCFLAGS='-Z unstable-options --check' just doc
  @RUSTDOCFLAGS='-Z unstable-options --check' just doc --document-private-items

# Format the code using `rustfmt`
[no-cd]
format *arguments:
  cargo fmt --all {{arguments}}

# Lint the code using `clippy`
[no-cd]
clippy *arguments: install-cargo-hack install-rust-script
  @just lint-toml "generate"
  @just in-pr cargo clippy --profile {{profile}} --workspace --all-features --all-targets --no-deps {{arguments}}
  @just not-in-pr cargo hack --workspace --optional-deps --feature-powerset clippy --profile {{profile}} --all-targets --no-deps {{arguments}}

# Creates the documentation for the crate
[no-cd]
doc *arguments:
  cargo doc --workspace --all-features --no-deps -Zunstable-options -Zrustdoc-scrape-examples {{arguments}}

# Builds the crate
[no-cd]
build *arguments:
  cargo build --profile {{profile}} {{arguments}}

# Run the test suite
[no-cd]
test *arguments: install-cargo-nextest install-cargo-hack
  @# We only run a subset of tests in PRs to save CI time. The merge queue will test the full suite below.
  @just in-pr cargo nextest run --cargo-profile {{profile}} --workspace --all-features {{arguments}}
  @just not-in-pr cargo hack --workspace --optional-deps --feature-powerset nextest run --cargo-profile {{profile}} {{arguments}}

  @just in-dev cargo test --profile {{profile}} --workspace --all-features --doc

# Run the test suite with `miri`
[no-cd]
miri *arguments:
  cargo miri test --workspace --all-features --all-targets {{arguments}}

# Runs the benchmarks
[no-cd]
bench *arguments:
  cargo bench --workspace --all-features --all-targets {{arguments}}

# Run the test suite and generate a coverage report
[no-cd]
coverage *arguments: install-llvm-cov
  cargo llvm-cov nextest --workspace --all-features --all-targets {{arguments}}
