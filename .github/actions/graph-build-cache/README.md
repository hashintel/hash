# Graph integration build reuse

The Test workflow can restore the graph executable built by
`cargo build --bin hash-graph --all-features`. The existing Turbo compile task
remains uncached. After pruning and installing dependencies, `prepare` replaces
only that checkout's compile script with the guarded compiler invocation.
The tracked application scripts and compilation outside this CI path are unchanged.
Reuse is enabled for the Playwright, backend integration, and graph HTTP jobs.
They produced the same cache key in the measured runs; if their inputs diverge,
exact keys prevent cross-use. Other integration jobs keep the normal Cargo path.

A hit restores `target/debug/hash-graph` atomically. The cache contains only the
executable and its input key and SHA-256 digest. It contains no migrations,
databases, readiness results, test results, or frontend bundles. Existing service
startup, migration, healthcheck and integration commands still execute.

The first use of a restored payload verifies its checksum and installs the live
executable atomically. Later compiler requests in that job reuse the live file
while its source, tool, environment, CPU-affinity and file-stat witness remains
unchanged. A mismatch takes the full guarded path. This avoids repeatedly hashing
the large executable while retaining the exact cross-job cache key.

On a cold miss, each job keeps Cargo's output locally. One selected producer may
later copy it into an independent payload inode for upload, after any startup
healthchecks pass. Restoration installs the cached file through an atomic hardlink,
with a copy fallback when links are unavailable. The detached upload payload keeps
cache publication from changing the live executable or Cargo's retained output in
`deps`. A local lock
outside the cached payload serializes compiler invocations, unsupported-environment
fallbacks and publication.

## Input and trust boundaries

The key includes whole local-package directories in the graph's resolved Cargo
dependency closure, including generated inputs and missing tracked files. All
dependency kinds and target conditions are retained as a conservative superset.
The corresponding package and resolution records, root Cargo manifest and lockfile,
toolchain files, Cargo configuration, helper files, compiler/tool identities,
compiler environment, runner image/platform, and canonical checkout path are also
inputs. The path matters because the graph embeds `CARGO_MANIFEST_DIR` when locating
runtime environment files. Unrelated frontend, documentation and workflow files
outside those directories are excluded.
Reuse is limited to Linux x86_64. The probe requires usable `x86-64-v3`
features on every permitted CPU,
including operating-system AVX state. The key uses that configured compilation
class, so extra features and model labels do not split compatible runners.
The native cache-line value used by `kiddo` is also an input. A small standalone
Rust probe reads the relevant CPUID fields on supported Intel/AMD hosts. Every
permitted CPU must report the same usable value;
unknown vendors, failed probes and inconsistent results bypass reuse. The probe
uses the resolved compiler with an explicit edition and baseline ISA, runs with
affinity confined to its child process,
and deletes its temporary executable after inspection.
Changes to the audited detector dependencies' versions or registry sources also
bypass reuse until the probe's decoding is reviewed for those revisions.
That guard covers the detector only. Dependency or build-script changes that
introduce other build-time host specialization require renewed portability review
and an input-model update before reuse is enabled for those inputs.
The untracked wasm-pack output in the type-system crate is excluded because native
graph compilation does not consume it; tracked files there remain inputs.

Cargo metadata resolves the pruned workspace before hashing. Package directories
cover the current embedded migrations, schemas and documentation. Build scripts or
procedural macros that introduce reads outside the modeled directories require an
explicit input-model update; metadata alone does not describe arbitrary file I/O.
The helper rechecks inputs after compilation and refuses to reuse or publish an
output if they changed. Its job-local ready state is outside the uploaded payload.
It re-enumerates the modeled paths and compares mode, device, inode, link count,
ownership, size, modification time and change time before skipping another full
fingerprint. This uses the runner filesystem's ordinary stat and change-time
semantics; an invalid or malformed state takes the full path.
Restoration requires the exact key, a regular executable with the expected ELF
architecture, and the matching checksum. Invalid or incomplete payloads fall back
to compilation. Unsupported configurations use the original Cargo command.

Compilation in the supported CI path uses an explicit environment and stable
compiler-tool paths. Relevant Cargo, Rust, native compiler and protoc settings are
retained; unrelated runner and service variables are not supplied to compilation.
Custom output targets, profiles, flags, external include/library paths and Cargo
configuration selectors outside the supported model bypass reuse. The helper
stores environment hashes, never environment values.

GitHub Actions caches use exact keys without restore prefixes. Default-branch and
pull-request cache visibility remains governed by GitHub's cache scope; this
workflow does not use privileged pull-request execution or consume caches from a
separate untrusted workflow. Workflows run in a fork use that fork's cache; a
fork-origin pull request run here follows this repository's pull-request cache
scope.
Pull-request and merge-group runs are restore-only. On pushes to `main`, setup
selects one producer from the jobs present in the dynamic matrix, preferring graph
HTTP, then backend integration, then Playwright. The other jobs remain
restore-only. A miss compiles normally, and a run with none of those jobs does not
seed an entry.
Entries follow the repository's GitHub Actions cache retention and storage
limits; the helper creates no separate permanent storage or custom expiry.
Changed inputs use a new key, and unused entries remain subject to eviction.

The root Cargo manifest and lockfile remain whole inputs, so unrelated Cargo
dependency updates may still miss the cache. Different pruned dependency closures
or incompatible runner inputs also remain distinct. No workflow saving is assumed from
a binary hit; preparation and transfer costs are part of the measurement.

## Focused checks

```sh
python3 .github/actions/graph-build-cache/graph_build_cache_test.py
CHECK_DIR=$(mktemp -d)
trap 'rm -rf "$CHECK_DIR"' EXIT
rustc +stable --edition=2021 --test .github/actions/graph-build-cache/cache_line_probe.rs -o "$CHECK_DIR/check"
"$CHECK_DIR/check"
```

The colocated unit checks use synthetic source trees and compiler outputs. They
cover direct/transitive/generated/non-Rust inputs, dependency and tool changes,
unsupported environments, malformed or absent payloads, failed builds, and
restoration permissions, concurrent compilation, detached publication, copy
fallback and archive restoration. They
do not substitute for integration tests on a fresh runner.
