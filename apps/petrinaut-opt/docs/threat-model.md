# Petrinaut optimization execution: threat model and isolation

This document threat-models the Petrinaut optimization execution path and
records the isolation properties each layer provides, what still relies on
deployment configuration outside this repository, and why an additional V8
sandbox is currently not required.

## Execution path

```text
HASH client
  │  POST   /api/petrinaut-optimizer/optimize/runs   (create → run id)
  │  GET    …/optimize/runs/{id}/events?cursor=N     (attach / re-attach)
  │  DELETE …/optimize/runs/{id}                     (explicit cancel)
  │  all authenticated and rate-limited
  ▼
NodeAPI (apps/hash-api) — stateless proxy
  │  proxies the same three routes, forwards the caller's account as
  │  `x-hash-account-id`, and converts the optimizer's SSE to NDJSON
  ▼
Petrinaut Optimizer (apps/petrinaut-opt, FastAPI + Optuna)
  │  a run is detached: it outlives the connection that created it
  │  spawn `petrinaut serve --optimization-stdin --stdio`
  │  JSON-lines over stdin/stdout, one CLI process per study
  ▼
Petrinaut CLI (libs/@hashintel/petrinaut-cli, Node)
     compiles and runs the embedded model; executes manifest-authored
     code (metrics/dynamics via the restricted HIR pipeline; scenario
     expressions via sandboxed `new Function` until the Scenario HIR
     lands, see FE-1219)
```

Because runs are detached, losing a connection no longer ends a study. A run
ends only when it completes, is cancelled, exceeds its wall-clock ceiling, or
is reclaimed after the detach-grace period with no consumer attached — which
is what bounds slot occupancy in the tables below.

## Attacker model

The primary attacker is an **authenticated HASH user submitting a malicious
optimization manifest**. The manifest embeds a full model snapshot including
code strings that the CLI ultimately executes. Secondary concerns are a
compromised or buggy client holding streams open, and lateral movement from a
compromised CLI process.

Assets to protect:

- the NodeAPI process and its credentials (database, Kratos/Hydra, vault);
- the optimizer service's availability (4 concurrent studies per instance);
- other tenants' data — nothing tenant-specific is mounted into the optimizer
  container, so this reduces to protecting the host and network;
- the host and cluster the containers run on.

## Threats and mitigations by layer

### NodeAPI (`apps/hash-api/src/petrinaut-optimizer/`)

| Threat                                  | Mitigation                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unauthenticated access                  | Global auth middleware; handler returns 401 without `request.user`.                                                                                                                                                                                                                               |
| Request flooding                        | `express-rate-limit` 10/min per account or IP on create/cancel, with a separate 60/min bucket for re-attaches (429 + `Retry-After`). Per-account single-flight and the concurrent-study cap are enforced upstream by the optimizer (below), not here.                                             |
| Oversized payloads                      | 8 MiB serialized-body cap (413).                                                                                                                                                                                                                                                                  |
| Malformed manifests                     | Strict zod manifest schema (`petrinautOptimizationManifestSchema`) with bounded work limits (≤ 100k steps/trial, ≤ 5M total steps, ≤ 1k trials).                                                                                                                                                  |
| Stalled clients holding proxy resources | Response-start (30 s), idle (5 min), and overall (15 min) deadlines end one **attachment**; the backpressure wait is bound to the same abort signal. Ending an attachment no longer ends the run, so study-slot occupancy is bounded by the optimizer's ceiling and detach-grace reaping instead. |

### Optimizer service (`apps/petrinaut-opt`)

| Threat                              | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Oversized manifests                 | ASGI middleware caps bodies at 8 MiB, including chunked transfer.                                                                                                                                                                                                                                                                                                                                                                                                         |
| Study-slot exhaustion               | Admission cap of 4 concurrent studies plus per-account single-flight, both keyed on the `x-hash-account-id` the proxy forwards (429 + `Retry-After`). A slot is held for the run's lifetime and released by an idempotent cleanup on completion, cancellation, ceiling expiry, or detach-grace reaping (`HASH_PETRINAUT_OPT_DETACH_GRACE_SECONDS`, default 300 s with no consumer attached).                                                                              |
| Cross-account access to a run       | Attach and cancel resolve a run only within the caller's account tag; a run belonging to another account answers 404 rather than revealing its existence. A second attachment supersedes the first (terminal `event: superseded`) so a stolen cursor cannot silently shadow the owner's stream.                                                                                                                                                                           |
| Runaway studies                     | Per-response protocol read timeout (240 s), bootstrap timeout (25 s), a hard cap of 1,000 trials per description, and a study wall-clock ceiling (`HASH_PETRINAUT_OPT_MAX_STUDY_SECONDS`, default 900 s) that terminates the run and its CLI.                                                                                                                                                                                                                             |
| Credential exposure to model code   | The CLI child environment is an allowlist (`PATH`, `LANG`, `LC_ALL`, `NO_COLOR`, `TZ`, plus `PETRINAUT_CLI_NODE_OPTIONS` → `NODE_OPTIONS`); parent credentials are never forwarded.                                                                                                                                                                                                                                                                                       |
| Surviving subprocesses              | The CLI is spawned with `start_new_session=True` (own session/process group). Cancellation and timeouts signal the **whole group** immediately (`SIGTERM` → `SIGKILL`); every close path ends with a `SIGKILL` sweep of the group, so descendants that remain in the CLI's session/process group cannot outlive the study. `tini` runs as PID 1 to reap orphans once they exit. A descendant that calls `setsid()`/`setpgid()` escapes the sweep (see limitations below). |
| CPU / memory exhaustion by the CLI  | `resource.prlimit` (Linux) bounds the CLI process: `RLIMIT_CPU` (`HASH_PETRINAUT_OPT_CLI_CPU_SECONDS`, default 900 s), `RLIMIT_AS` (`HASH_PETRINAUT_OPT_CLI_MEMORY_BYTES`, default 2 GiB), `RLIMIT_NPROC` (`HASH_PETRINAUT_OPT_CLI_MAX_PROCESSES`, default 256, a per-real-UID fork-bomb bound — see limitations below). Node's `--max-old-space-size=768` additionally caps the V8 heap (but not `ArrayBuffer`/native allocations — `RLIMIT_AS` is the resident bound).  |
| Protocol abuse by a compromised CLI | 8 MiB protocol line cap, id-matched responses, strict response validation; protocol violations tear the study down promptly.                                                                                                                                                                                                                                                                                                                                              |

Known limitations at this layer:

- `prlimit` is applied from the parent immediately after spawn, so the child
  runs unbounded for microseconds; container-level limits are the backstop.
- The group `SIGKILL` sweep runs after the group leader is reaped; the pgid
  could in principle be recycled in that window. Inside the container's pid
  namespace this is negligible, and the sweep ignores `PermissionError`.
- The group sweep only reaches descendants still in the CLI's process group:
  one that calls `setsid()`/`setpgid()` escapes it and runs until its
  inherited `RLIMIT_CPU` or the container's `pidsLimit`/teardown stops it
  (`tini` reaps it only once it exits, it does not kill live orphans).
  Manifest-authored JS cannot spawn processes at all (`--permission` without
  `--allow-child-process`/`--allow-worker`), so this applies only after a
  native permission-model escape.
- `RLIMIT_NPROC` is checked against the **real UID's total task count**
  (processes and threads) — shared by uvicorn, tini, and all concurrent CLIs,
  which all run as `petrinaut` — not against one CLI's own descendants. Size
  it against total service tasks; a fork bomb in one study is contained but
  can starve sibling studies' thread creation (contained cross-study DoS),
  for which the container-level `pidsLimit` is the backstop.
- The in-memory admission counter is per-instance; running multiple optimizer
  replicas multiplies the effective study limit.
- `/status` is unauthenticated and enumerates run ids and phases (no user
  data). It must not be exposed outside the service network.

### Petrinaut CLI (container + process posture)

| Threat                                  | Mitigation                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filesystem access from model code       | Node permission model: `--permission --allow-fs-read=/opt/petrinaut-cli --allow-fs-read=/usr/local/bin/petrinaut` — reads restricted to the CLI's own tree, **no** filesystem write permission granted; `--no-addons` blocks native modules; `--no-global-search-paths` and `--disable-proto=throw` reduce ambient surface.                                 |
| Privilege escalation                    | Dedicated non-root `petrinaut` system user; `umask 0o077` on the child.                                                                                                                                                                                                                                                                                     |
| Arbitrary code execution from manifests | Model metrics, dynamics, lambdas, and kernels are compiled through the restricted HIR pipeline (TypeScript-lowered, typechecked, compiler-emitted). Scenario parameter overrides and initial-state expressions still execute via `new Function` behind a best-effort sandbox — this is the remaining raw-code path that the Scenario HIR (FE-1219) removes. |
| Network egress from model code          | **Not restricted by the Node permission model.** Until the Scenario HIR lands, egress control relies on deployment-level network policy (see below).                                                                                                                                                                                                        |

## Required deployment configuration (outside this repository)

ECS task definitions for `petrinaut-opt` live outside this repository. The
following settings are required for the isolation model to hold and must be
captured there:

1. `readonlyRootFilesystem: true` — the image is compatible (the service
   writes nothing; run locally with `docker run --read-only`). Provide a
   tmpfs mount for `/tmp` if Node requires it.
2. Task-level CPU and memory limits sized for up to 4 concurrent studies.
   Each CLI's resident memory is bounded only by `RLIMIT_AS`
   (`HASH_PETRINAUT_OPT_CLI_MEMORY_BYTES`, default 2 GiB) —
   `--max-old-space-size` caps only the V8 heap, not `ArrayBuffer`/native
   allocations — so size task memory at roughly _concurrent studies ×
   `RLIMIT_AS`_ plus the service's own footprint, or lower
   `HASH_PETRINAUT_OPT_CLI_MEMORY_BYTES` so four times the limit fits the
   task.
3. An egress security group that denies all outbound traffic except any
   destinations the service itself requires (it requires none today) — this
   is the only network-level control on manifest-authored code until the
   Scenario HIR removes raw execution.
4. `pidsLimit` (or equivalent) as a container-level backstop to
   `RLIMIT_NPROC`.
5. No credentials or secrets in the task environment beyond what the service
   itself needs (it needs none today); the CLI child never inherits them
   regardless, but defence in depth applies.

## Decision: no additional V8 sandbox for now

We considered wrapping manifest-authored code in a dedicated V8 isolate
sandbox (e.g. `isolated-vm`) or a separate JS runtime. Decision: **not now**,
because:

1. The hot code surfaces (metrics, dynamics, lambdas, kernels) already run
   through the restricted HIR compiler — only compiler-emitted source is
   instantiated, and code that cannot be lowered fails compilation.
2. The remaining raw surface (scenario expressions) is being replaced by the
   Scenario HIR (FE-1219), which removes unrestricted `new Function`
   execution entirely rather than containing it.
3. The CLI already runs as an isolated, non-root, allowlist-environment,
   fs-read-restricted, resource-limited, promptly-killable process inside a
   dedicated container — a compromised CLI has no credentials, no writable
   filesystem beyond tmpfs, and (with the required egress policy) no network.
4. `isolated-vm`-style sandboxes require native addons, which the CLI
   deliberately blocks (`--no-addons`), and they carry their own maintenance
   and escape-surface costs.

Revisit this decision if raw user-authored JavaScript execution is ever
reintroduced on the server path, or if the CLI gains network-dependent
features that preclude a deny-all egress policy.

## Residual risks

- Scenario expressions execute as raw JavaScript in the CLI process until
  FE-1219 lands (bounded by the container, user, filesystem, resource-limit,
  and network layers above).
- Network egress from the CLI is unconstrained until the deployment-level
  egress policy is applied.
- Per-instance admission limits do not aggregate across replicas.
- A malicious manifest can still burn its full CPU/wall-clock allowance per
  study (bounded denial of service within the admission cap).
