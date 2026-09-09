# Local Postgres fixture departure

## Earned boundary

Authority: `db3d7cc`. Local selector implementation: `988ad5c`. `BRUNCH_DB_KIND=postgres` uses the existing adapter, dedicated fields and verified TLS outside production. Default SQLite remains available; production cannot select it. Parent inspection and 49 configuration/runner tests passed, followed by the full app server/client build.

The actual built `server.mjs` booted against isolated PostgreSQL 17.11 with verified localhost TLS, migrated the seven native Flue tables, returned `/health` 200 and exited on SIGTERM (143). No provider credentials or submissions were supplied to that startup probe.

An ephemeral copy of the existing persona/browser witness then selected Postgres instead of its SQLite test setup. The existing assertions passed through the built ChatAgent, native synthetic provider and real Chrome: 11 synthetic requests, two source-linked workpiece revisions, visible chat/workpiece and ordinary UI reload/continuation. Both production configuration and explicit development Postgres completed with exit 0 once a local telemetry receiver was present. Final development witness: `/tmp/m7-persona-browser-OQ0OGn/`. Source-store counts after three synthetic sessions were 12 submissions, three streams and 207 batches. These are Postgres-backed session observations, not transfer proof.

Temporary setup/results: `/tmp/brunch-postgres-transfer.AJmKA5/`. The first production browser run reached all assertions but exited 1 on telemetry shutdown because the local collector was absent; its log remains. Two earlier probe-launch failures (Node refuses type stripping below node_modules, then strip-only rejects the existing uncommitted accounting parameter-property syntax) also remain. The successful disposable probe used Node's experimental type transform; it did not change that unrelated source. An isolated cached OpenTelemetry collector with a no-op exporter resolved the local setup failure without application changes. All probes omitted real provider credentials and used the maintained loopback OS sandbox.

## Transfer boundary still unresolved

Installed Flue exposes canonical stream, submission and attachment persistence interfaces, but no selective session export/import operation. Public SDK history is a materialized read projection, not a restoration API. Stream creation mints an incarnation; append fences producers and requires submission-attempt authorization. Replaying history through ordinary sends would not preserve the native identities.

A whole dedicated database dump/restore is the smallest candidate operational clone, not yet a witnessed fixture import contract. The coupled tables are `flue_meta`, `flue_agent_submissions`, `flue_submission_chunks`, `flue_conversation_streams`, `flue_conversation_stream_batches`, `flue_conversation_fold_checkpoints` and `flue_attachments`. Browser-owned document/incarnation and principal/conversation selection must also be restored through a deliberate UI fixture path. Which browser caches are actually required must be tested rather than copied wholesale by assumption.

Whole-database replacement is not an acceptable way to add examples to an existing populated demo database. Selective restoration would require a bounded, explicitly owned native-format contract or a new supported upstream boundary; neither is implied by database parity. No destination import, remote write/deploy, general exporter, paid call, ledger edit or portability/utility acceptance occurred.
