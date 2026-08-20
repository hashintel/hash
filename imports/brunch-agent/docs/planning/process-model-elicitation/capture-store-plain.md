# The capture store, in plain terms

A plain-prose rendering of what the top of the stack establishes: the capture store
(FE-1390, `packages/core/src/capture-store.ts` + `packages/binding-flue/src/local-capture-store.ts`)
and the ask/reply machinery it will eventually serve (FE-1389, where the two touch). Rendered
from the code first, with the kernel spec (§5, §9.6, §14.1) and CONTEXT.md as the claimed
semantics the code is read against. The strain report at the end is the review yield: every
place the source resisted plain rendering.

## What the store is

The capture store is the durable truth of a target-document. It holds three families of
records: captures, issues, and events. A capture is a capture envelope: harness-minted id,
evidence or a declared basis, epistemic status, confidence, exactly one value or absence
state, an optional alternatives group, an optional single `supersedes` link, and a
content-derived dedup key. An issue is stored backpressure: a type (one of seven), a producer
(harness, or plugin with a namespace), and references to existing captures. An event is one of
three things: a resolution record, a retraction, or an issue-closed marker.

No record carries a status field. Nothing in the store says "this capture is superseded" or
"this issue is closed". Those are read-time answers, computed from the records.

## What a write is

A write is a command. There are five: apply a sweep of capture proposals, open an issue, close
an issue, resolve a conflict, retract a capture. The command logic is one pure function: it
takes a snapshot and a command, and returns either a new snapshot plus a result value, or a
refusal. It never returns both. A refused command changes nothing.

A sweep applies whole or refuses whole. If one proposal in the batch is invalid, the entire
sweep is refused and no capture is added. Valid proposals that duplicate existing content are
skipped, not refused: the store computes a dedup key from evidence and content — epistemic
status is deliberately excluded — and a retried proposal with the same key adds nothing.
Changing your epistemic reading of the same evidence therefore requires explicit supersession;
it can never happen as a silent update.

A proposal that supersedes another capture must name a capture that exists, is currently
active, and is not already superseded by an earlier proposal in the same batch. New captures
get fresh harness-minted ids. The sweep result also reports advisories — pairs of active
captures that look possibly equivalent (same evidence, or near-identical text payloads).
Advisories are returned to the caller and never stored.

Every command appends. No command edits a record. No command deletes a record. Corrections
are new records: a superseding capture, a resolution record, a retraction event.

## What the store refuses, and why

The refusal surface is the store's contract. In plain terms:

- **A capture without provenance.** User-grounded captures (`explicit`, `inferred`,
  `tentative`) need at least one evidence span: a non-empty quoted excerpt plus a pointer
  (session id, entry range, range must not end before it starts). `defaulted` captures must
  cite a declared default. `external-lookup` captures must cite a documented transformation.
  There is no fourth shape.
- **A capture with both a value and an absence state, or neither.** Exactly one. Absence is a
  first-class value with six named states; it never collapses to null.
- **A value that cannot survive JSON.** Non-finite numbers, class instances, functions — refused.
- **Superseding a non-head.** If the target is already superseded or retracted, the refusal
  names the current active heads so the caller can re-aim.
- **Closing a conflicting issue with a plain close.** A `conflicting` issue closes only through
  a resolution record. The resolution must cite the true user's utterance, must name a winner
  and at least one loser, and must account for exactly the captures the conflict references —
  no more, no fewer, no duplicates, all of them still active.
- **Retracting anything but an active capture.** Retraction is an event that cites the true
  user and names no successor.
- **An issue referencing nothing, or referencing unknown captures.**

The persisted file gets its own guard: on every read, the whole snapshot is re-parsed and
cross-checked. Duplicate ids, stale dedup keys, supersession cycles, forking supersession
histories (two successors for one capture), events citing non-user evidence, resolutions that
do not account for their conflict, issue-closed events on conflicts — all of these make the
read throw rather than return a corrupted truth.

## What derives at read time

Three questions are answered by computation, never by stored flags:

- **Capture status.** Retracted if a retraction event names it. Otherwise superseded if a
  capture supersedes it or a resolution names it as a loser. Otherwise active.
- **Issue status.** Closed if a resolution or issue-closed event names it. Otherwise open.
- **Current heads.** Following supersession links and resolution outcomes forward from any
  capture to the captures that currently speak for it.

## What the binding owns

The core module owns the rules; the Flue binding owns the disk. `LocalCaptureStore` keeps the
snapshot as one JSON file. Reads parse and validate the whole file; a missing file is an empty
store. Writes go to a temporary file first and are renamed into place, so a crash mid-write
leaves the old file intact, never a half-written one. Commands against the same path are
queued in process order; each command reads the current file, applies, and writes before the
next begins. A refused command writes nothing.

## What the ask machinery adds (FE-1389)

The walking skeleton beneath this branch proves the conversation side: each `ask` suspends the
turn on a durable pending affordance (held in per-session state), and the next user dispatch is
mechanically bound as the reply — the harness appends a signal entry naming the affordance, so
the binding is a recorded fact, not a model inference. The store is built to receive this:
evidence spans may anchor on `user-affordance-payload` entries, which is exactly what these
affordance replies are. That is where the two branches touch — and today it is only a
type-level touch (see strain report, item 3).

## What the tests prove

The core suite pins six of the spec's ten harness invariants by name: retries deduplicate by
content not epistemic status (5); one invalid proposal refuses the whole sweep (7); all six
absence states survive storage (9); explicit/inferred/defaulted stay distinct (10); supersession
keeps history and status derives (4); conflicts close only through user-cited resolution (2).
It also pins: resolutions account for every conflicted capture; persisted tampering (stale
dedup keys, forking supersession, silent conflict-close) is refused at parse; retraction is a
user-cited event with no successor; equivalence advisories surface and are not stored. The
binding suite pins: round-trip persistence with no stored statuses, serialized concurrent
writes, and that a refused sweep never persists partially.

## What is NOT guaranteed

This section is load-bearing. The store guarantees nothing beyond the boundary of its snapshot.

1. **A conflict can be born unclosable.** The store accepts a `conflicting` issue with one
   reference, but every legal resolution needs a winner and at least one loser drawn exactly
   from the references — so a one-reference conflict can never be resolved and never plainly
   closed. Separately, nothing stops supersession or retraction of a capture an open conflict
   references; once one referenced capture is no longer active, the resolution's all-active
   requirement can never again be met. Both paths end in an issue that is permanently open.
2. **Evidence pointers are unverified and unbacked.** The store never sees session entries. It
   cannot check that an excerpt appears in the pointed-at range, and there is no session-log
   archive — the spec's "every entry a capture points to must be retrievable forever" (§9.6)
   has no implementation. A pointer is a promise the store cannot keep or check.
3. **Provenance labels are trusted, not verified.** "Anchors only on true user entries" is
   enforced against a `source` field the caller supplies. The store refuses a span *labeled*
   non-user; it cannot detect a mislabeled one.
4. **Append-only holds at the command surface, not the storage surface.** No command removes a
   record, but the binding rewrites the whole file on every write. The parse guard catches
   inconsistent tampering; a hand-edit that deletes records and stays self-consistent reads
   back as truth.
5. **Serialization is per-process.** Two processes writing one file are not serialized; the
   tmp-and-rename write prevents torn files but not lost updates.
6. **No caller exists.** Nothing in the running system produces captures. Settlement and sweep
   are not built; the dev app's walking skeleton never touches the store. Every guarantee above
   is currently exercised only by tests.
7. **Confidence is any non-empty string.** The spec says "qualitative, never a
   scalar-for-everything"; the code enforces only non-emptiness.
8. **Payloads are opaque.** The store validates the envelope only. Plugin payload validation
   (the spec's second validation stratum) does not exist here, and `alternativeGroup` is an
   uninterpreted label with no enforced semantics.

## Strain report

Ranked by consequence. Each item is a place the source resisted plain rendering.

1. **The unclosable conflict (two independent paths).** The sentence "a conflict closes only
   through a user-cited resolution" renders cleanly; the sentence "every conflict can be
   closed" cannot be written at all. A one-reference conflict is command-reachable and
   permanently unresolvable, and superseding a conflict-referenced capture strands the conflict
   forever. The refactor queue's commits 7 and 8 target exactly these; the rendering
   independently confirms both from the code.
2. **"Append-only and transactional" — the title over-promises relative to the storage layer.**
   Rendering forced the split into "no command removes a record" (true) and "records cannot be
   removed" (false at the file level). Likewise "transactional" had to become "atomic within
   one process": the write queue is a module-level map keyed by path, invisible across
   processes. The honest rendering needed a whole "not guaranteed" section that the one-line
   commit message does not hint at.
3. **The bridge with no middle span.** The directive asked for "the semantics FE-1389 adds
   where they touch the store"; rendering found the touch is one string literal —
   `'user-affordance-payload'` as a legal span source. No settlement, no sweep caller, no wiring.
   Stating what the top branches establish *together* required writing "they do not yet
   connect," which no document had said.
4. **Provenance verification is structural, not evidential.** The spec's provenance language
   ("cite the true user's utterance") reads as a fact check; the code implements a shape check
   on self-declared labels. Penciled item 7's deterministic tier (excerpt verbatim in the
   pointed-at range) is unimplementable from inside this module — the store has no access to
   entries. The check belongs at sweep application (harness-resolved anchoring, §8.2), which
   does not exist yet; until then the store carries tier-1-looking fields with no tier-1 check
   behind them.
5. **Three rule surfaces, one contract, no equivalence proof.** Proposal validation, snapshot
   parsing, and derived-status logic each restate overlapping rules in separate code. Rendering
   "what the store refuses" required merging three lists and trusting they agree; the refactor
   queue's shared-invariant commits (1, 5, 6, 9) target exactly this duplication.
6. **Epistemic status is capture-scoped — FE-1405's arity question has a type-system answer.**
   One capture carries exactly one epistemic status and one confidence for its whole payload.
   A capture whose fields deserve different statuses cannot exist; the granularity rule
   (one assertion per capture) is what makes that livable, but nothing enforces granularity —
   a caller can store an arbitrarily large payload under one status. The IR's loss-report
   arity problem and the envelope's status arity are the same question at two layers.
7. **"Sweep" names two different things.** In the spec, a sweep is a pass over settled
   conversation that *produces* captures; in this module, `apply-sweep` is the transaction that
   *stores* proposals someone else produced. The rendering had to say "a sweep of capture
   proposals" to stay honest. The naming will mislead the first reader who arrives from the
   spec.
8. **Session-log archive: scope claimed, scope absent.** Spec §9.6 puts the archive inside the
   storage port's scope ("the port's scope is the capture store plus the session-log archive").
   The implemented port is captures/issues/events only. The rendering could not call this store
   "the storage port" without the qualifier; it is the storage port's first half.

> **Reflection:** The store is the stack's first genuine piece of layer-3 machinery, and its
> teeth are real — the refusal surface and the parse-on-read guard are exactly the "enforcement
> requires state outside the conversation" argument made concrete. But every high-consequence
> strain item has the same shape: the guarantee weakens wherever it depends on a fact outside
> the snapshot — session entries it cannot see, processes it cannot see, callers that do not
> exist, labels it must take on faith. The boundary of the snapshot is the boundary of the
> guarantee. That suggests the FE-1405/plugin-spec work should treat "what does the store need
> to *see* to enforce this?" as the first question for every proposed invariant, before "what
> shape should the field have?"
