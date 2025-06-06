#!/usr/bin/env just --justfile

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

# Runs the provided command in CI only
[private]
[no-cd]
in-ci +command:
  #!/usr/bin/env bash
  set -eo pipefail
  if [ -n "$CI" ]; then
    echo "{{command}}" >&2
    {{command}}
  fi


######################################################################
## Predefined commands
######################################################################

# Runs all linting commands and fails if the CI would fail
[no-cd]
lint:
  @just format --check
  @just clippy -- -D warnings
  @RUSTDOCFLAGS='-Z unstable-options --check' just doc
  @RUSTDOCFLAGS='-Z unstable-options --check' just doc --document-private-items


# Sync the package.json files to the `Cargo.toml` file
[no-cd]
sync-turborepo *packages:
    @cargo -Zscript run --manifest-path "{{repo}}/.github/scripts/rust/sync-turborepo.rs" "{{repo}}" {{packages}} | xargs just yarn fix:package-json

# Format the code using `rustfmt`
[no-cd]
format *arguments:
  cargo fmt --all {{arguments}}

# Lint the code using `clippy`
[no-cd]
clippy *arguments:
  @just in-pr cargo clippy --profile {{profile}} --all-features --all-targets --no-deps {{arguments}}
  @just not-in-pr cargo hack --optional-deps --feature-powerset clippy --profile {{profile}} --all-targets --no-deps {{arguments}}

# Builds the crate
[no-cd]
build *arguments:
  cargo build --profile {{profile}} {{arguments}}

# Run the test suite
[no-cd]
test *arguments:
  cargo hack --optional-deps --feature-powerset nextest run {{arguments}}
  cargo test --all-features --doc

# Run the test suite with `miri`
[no-cd]
miri *arguments:
  cargo miri test --all-features --all-targets {{arguments}}

# Runs the benchmarks
[no-cd]
bench *arguments:
  cargo bench --all-features --all-targets {{arguments}}
