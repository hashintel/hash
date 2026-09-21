# Retired evaluation instruments

This directory holds concise human-readable retirement records for evaluation
instruments that are no longer supported. A record names the replacement or
final disposition and the historical Git revision that still contains the
complete source.

Do not copy runnable code here for compatibility. Delete obsolete runners and
tests after their provenance has been recorded. Do not retain raw observed
output, hash ledgers, or recovery archives in the repository. Decision-relevant
conclusions belong in `MISSION.md`, an ADR, or one final campaign adjudication.

## Persona SDK/spectator path — retired 2026-09-14

The persona-specific SDK submission loop, mock/headless tool hosts, browser-session attachment and spectator integration were replaced by the [browser-visible persona launcher](../../../../../../apps/brunch-agent/.pi/extensions/brunch-persona-testing/README.md). Pi now requires the launcher's private bridge; the real panel executes all browser tools. The retired source is available at [65c9eadb07](https://github.com/hashintel/hash/commit/65c9eadb07) under `apps/brunch-agent/src/evaluations/persona/` and its associated tests. Independent runbook/headless construction probes remain supported; they are not alternate persona methods. The former inability to inspect or construct in a visible persona run was an executor limitation, not a product constraint.
