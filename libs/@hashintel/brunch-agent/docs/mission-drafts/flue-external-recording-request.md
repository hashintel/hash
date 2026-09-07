# Upstream request — record external dialogue without invoking the agent

> Draft cluster only. Not execution authority. Do not implement until this cluster is re-evaluated and cut into `MISSION.md`.

Prepared under Kostandin Angjellari's 2026-09-07 approval to pursue the bounded upstream prerequisite. This is the maintainer-facing request, not an accepted API or a private implementation. [Conversion and product stages](voice-runtime-ownership-conversion.md) remain separate. Posting this request requires explicit external-write approval.

**Destination:** `withastro/flue` Discussions, category **Feature Request**, following its [contribution policy](https://github.com/withastro/flue/blob/832ad2eeaf5e4b07d39749fc669e7ad556238313/CONTRIBUTING.md) and `.github/DISCUSSION_TEMPLATE/feature-request.yml`. Upstream does not accept unsolicited PRs. Do not open an upstream implementation PR as a substitute.

**Related request:** [discussion #605](https://github.com/withastro/flue/discussions/605) asks for one-time bootstrap/import and deletion. It had no comments when inspected. This request concerns ongoing appends to an existing, active conversation, not import, replacement, or deletion. Link the related request rather than claim this capability is already planned or supported. Maintainers may choose to combine them.

The proposed public body follows. API naming and implementation remain maintainer decisions.

---

## Summary

Provide a supported persistence-only operation for recording externally conducted human/assistant exchanges in an existing Flue conversation, without invoking its agent. Preserve distinct external authorship and original evidence so a later ordinary signal can ask the agent to interpret it.

## Background & Motivation

Kostandin Angjellari is developing a voice experience in HASH where a Flue agent owns domain strategy, interpretation, and tool selection, while a Realtime conversational runtime handles wording and a narrowly delegated clarification. Users should have one continuous typed/spoken conversation and one durable history. A short permitted follow-up should be recorded without re-running the domain agent, but its original wording and answer must be available when interpretation resumes.

At Flue 2.0.3 / upstream [832ad2e](https://github.com/withastro/flue/commit/832ad2eeaf5e4b07d39749fc669e7ad556238313), the inspected SDK exposes send/read/wait/abort/history/observe and attachment URLs, but not an external recorder. A normal `kind: "signal"` send is suitable for the later non-human handback, not for the no-wake exchanges themselves. `ctx.append` is an in-lifecycle signal append, not an external writer for human/assistant dialogue.

A local baseline using the built SDK, public router and Node bootstrap with SQLite and a faux provider confirmed that both user and signal sends execute the agent and its start hook. A deliberately hook-rejected signal made zero additional model calls while still entering the agent and start hook. Therefore, checking provider usage alone would be insufficient evidence of no-wake behavior. Canonical history survived a clean second-process reopen unchanged; no external dialogue recording was implemented or tested.

This differs from [#605](https://github.com/withastro/flue/discussions/605): the needed capability records ongoing dialogue into an existing conversation, potentially between normal agent activity and tool continuations. It does not bootstrap, overwrite, fork, or delete the conversation. Is there an existing supported extension point for this, or would maintainers consider a public contract?

## Goals

- **Record without executing.** Append durably to the existing canonical conversation without creating a submission, scheduling agent work, entering the agent function, running hooks/models/tools, or mutating agent state. Normal sends and non-human signal admissions keep their existing behavior.
- **Preserve authorship without granting authority.** Retain human versus external-assistant authorship, application-validated actor identity, modality, raw recorded wording, and separately identified normalization when present. Never project an external assistant's text as Flue-agent-authored validation, response metadata, tool requests, or tool results. Applications own authentication, conversation access, and authority checks; a caller's actor string is not an attestation.
- **Keep one recoverable record.** Stable original event/message IDs and provenance survive history, live observation and fresh-process reconstruction. The next ordinary agent admission can access the originals with their source distinction, not only a generated summary. Provider history and browser storage are not alternative authorities.
- **Define identity and order.** Scope caller-stable identities to the target instance/incarnation. Identical retries after a lost acknowledgement or restart return the original receipt; changed content/actor/modality under the same identity conflicts. Reject missing or wrong incarnations without creating a conversation. Canonical append order and causal references must remain unambiguous across concurrent recorders, ordinary sends, and browser-tool continuations; a client timestamp must not silently rewrite that order. Do not accept arbitrary runtime record IDs or foreign-conversation references as trusted causality.
- **Make failure recoverable.** Each acknowledged event is durable; a bounded batch, if offered, is atomic. Define how to reconcile an ambiguous append and how concurrent writers avoid partial records or duplicate identities. An append receipt is evidence of persistence, not exactly-once application effects or proof that audio was heard.
- **Leave room for honest delivery observations.** Generated wording and playback acknowledgements/cutoffs are different evidence. The Voice consumer will also need attributed, non-dialogue delivery observations with uncertain tails; these must not appear as fabricated spoken words or new human turns. Please identify whether that requires a separate supported canonical event kind or a later extension, rather than overloading dialogue text.
- **Compose with the public runtime.** Support the public SDK/router and the runtime targets the contract claims, with bounded validated inputs and host-middleware authorization. Do not require direct database writes, private writer acquisition, a patched package, or another transcript log.

Non-goals: implement Voice in Flue, transfer domain strategy to the external runtime, authenticate users inside Flue, authorize domain mutations, close application browser-operation cancellation, or change normal delivery/abort semantics. The application retains delegation validation, interpretation and effect recovery.

## Example

This is a behavioral sequence, not proposed runnable API syntax:

```text
Existing Flue conversation, pinned to its current incarnation
  domain agent delegates one clarification through its normal response
  record external-assistant wording A     -> durable original ID A, no wake
  record original human answer B          -> durable original ID B, no wake
  record external-assistant follow-up C   -> durable original ID C, no wake
  record original human answer D          -> durable original ID D, no wake
  normal signal admission                -> proposal referencing A/B/C/D
  domain agent reads originals            -> validates or rejects interpretation
  fresh process                          -> same originals, sources and identities
```

The discriminating acceptance test should count agent entries, hooks, scheduler activity and submissions as well as provider requests during the four records. Normal typed send and later signal admission are positive controls. Additional tests should cover exact/conflicting retries, wrong incarnation, cross-conversation access/references, forged agent authorship, ordering with normal continuations, and acknowledgement loss around a committed append followed by fresh-process reconstruction.

Please confirm whether this fits Flue's supported contract, the preferred public surface, and any constraints on Node/Cloudflare support or contribution format. An agreed implementation/release pin and boundary tests are needed before the consumer can rely on it; a feature discussion alone is not that support.
