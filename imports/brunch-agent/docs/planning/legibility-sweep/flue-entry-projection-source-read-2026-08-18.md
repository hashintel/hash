# Flue 2.0.3 entry projection and compaction source read

**Date:** 2026-08-18

**Scope:** FE-1391 (durable entry projection) pre-work; FE-1386 (compaction) triage

**Resolved packages:** `@flue/runtime@2.0.3`, `@flue/sdk@2.0.3`

## Question

Can FE-1391 rely on the installed Flue durable conversation GET surface for archive-on-read and
harness-resolved evidence anchoring? In particular:

- **B1:** what does the surface guarantee about route discovery, views, paging, offsets, public
  entry kinds, response types, errors, bounds, and the suspected thousand-entry limit?
- **B2:** does compaction preserve that public projection and `usePersistentState` state, or does
  it delete history while rewriting model context?

This is a source-read gate, not an implementation or live compaction experiment.

## Approach

The lockfile is the version authority: `bun.lock:240` resolves `@flue/runtime@2.0.3` and
`bun.lock:242` resolves `@flue/sdk@2.0.3`. I read the installed packages in this order:

1. exported SDK/runtime types and package-shipped protocol/persistence documentation;
2. mounted HTTP handlers and SDK client implementation;
3. canonical record reducer, public projection, compaction runner, and SQL/in-memory stores;
4. the current brunch-lite spec, capability declaration, open-gap ledger, and FE-1391/FE-1386
   issue contracts.

Evidence below is labeled **contract** when it is in exported types or package-shipped public
documentation, **implementation** when it is an installed 2.0.3 implementation fact, and
**inference** when it combines those facts for brunch-lite. Package `dist` filenames are
content-hashed and may change on upgrade; the resolved version is therefore part of every
source claim. Every abbreviated `@flue/...` evidence path below resolves under
`apps/dev/node_modules/` in this worktree.

## Verdict

**B1 is settled enough to implement FE-1391, but it corrects two premises.** The public GET
surface is a stable, materialized **message projection**, not the raw canonical entry log.
`history()` returns the whole projection as one snapshot with no paging parameter or
thousand-entry bound. The incremental `updates` view pages at 100 **durable batches**, not
entries or messages; the SDK drains further pages automatically. The framework cannot discover
an application's mount, and server-side relative URLs are rejected, so a binding reader needs a
host-supplied full conversation URL (or URL resolver) and may use a host-supplied `fetch` to stay
in-process.

**B2 is source-settled for Flue 2.0.3.** The authoritative stream is append-only. Compaction
appends a `compaction` record whose parent is the old active leaf, then rebuilds only the model
context as summary plus retained suffix. The public history projector independently walks the
full active path and skips the compaction record itself, so pre-compaction messages remain.
`state_write` records are reduced in a separate instance-state map and are unaffected.

FE-1386 therefore no longer needs an open-ended discovery spike. It should be reshaped to one
narrow behavioral/upstream-drift pin, or that pin should be folded into FE-1391. Source evidence
does not delete the existing §14.5 open gap because the repository deliberately requires a
behavioral proof to close one.

## B1 — exact public read contract

### Route and base URL ownership

| Finding | Evidence quality | Evidence |
| --- | --- | --- |
| `createAgentRouter(agent)` serves `GET|HEAD /:id` relative to the caller's mount. The host owns mounting, auth, and exposure. | contract | `@flue/runtime/dist/registration-I-i4wkiu.d.mts:75-90`; `@flue/runtime/docs/reference/streaming-protocol.md:7-19` |
| A client URL is the application-owned mount plus caller-chosen conversation id. Flue explicitly says it does not know the mount. | contract | `@flue/sdk/dist/index.d.mts:5-18,599-657` |
| Relative URLs work only against a browser origin. Outside a browser the SDK throws; a URL may not contain a query or fragment. | implementation | `@flue/sdk/dist/index.mjs:26-95` |
| The client accepts a custom `fetch`, and the returned Hono router has `.fetch`. | contract | `@flue/sdk/dist/index.d.mts:5-18`; `@flue/runtime/dist/registration-I-i4wkiu.d.mts:84-88` |
| `start()` intentionally exposes no HTTP surface; its `init()` handle reads one submission reply, not conversation history. | contract | `@flue/runtime/dist/node/index.d.mts:86-124`; `@flue/runtime/dist/index.d.mts:135-172` |

**Inference for FE-1391:** there is no binding-level base URL discovery contract. The host must
inject either a complete conversation-URL resolver or `(mount URL, fetch transport)`. An
in-process reader can pass an absolute placeholder URL plus the mounted Hono app's `.fetch`, but
the binding must not invent the mount. The type-level composition is available; an FE-1391 test
must still pin that it is safe from the actual binding/lifecycle call site, including reentrancy
and mount middleware. Calling this “self-HTTP” describes the protocol boundary, not a
discoverable server address.

### Views and response shapes

| View | Contract |
| --- | --- |
| `GET /:id` or `?view=history` | `200` JSON `FlueConversationSnapshot`; `Cache-Control: no-store`; `Stream-Next-Offset` equals the snapshot offset; `Stream-Up-To-Date: true`. `offset`, `tail`, and `live` are invalid. |
| `GET /:id?view=updates&offset=…` | `200` JSON update chunks, or long-poll/SSE when `live` is set. Exactly one offset is required. `tail` is invalid. |
| `HEAD /:id` | No body; head offset and up-to-date status in headers. |

The route dispatch and validation are public and implemented at
`@flue/runtime/docs/reference/streaming-protocol.md:105-203` and
`@flue/runtime/dist/dispatch-nU3cIlT-.mjs:3068-3185,3253-3264`.

The public history response is:

```ts
interface FlueConversationSnapshot {
  v: 1;
  conversationId: string;
  offset: string;
  incarnation?: string;
  messages: FlueConversationMessage[];
  settlements: FlueConversationSettlement[];
}
```

This is an exported **contract** at `@flue/sdk/dist/index.d.mts:195-228`. `history()` has only an
optional abort signal and issues `?view=history` directly
(`@flue/sdk/dist/index.mjs:1202-1228`).

The updates wire union discriminates `conversation-reset`, `message-appended`,
`message-started`, `message-metadata`, `data-part`, `message-delta`, `tool-input`, `tool-output`,
`tool-output-error`, `message-completed`, `submission-settled`, and `stream-checkpoint`
(`@flue/sdk/dist/index.d.mts:230-361`). The same declaration explicitly calls these chunks an
internal, UI-only projection protocol: application code is expected to consume `observe()` or
materialized messages, not chunks. The wire shapes explain paging and recovery, but they are
**not** the supported FE-1391 application contract.

### Public message discriminators

`FlueConversationMessage` is the supported consumption surface, exported at
`@flue/sdk/dist/index.d.mts:39-218`:

- `role`: `user | assistant | system`;
- `purpose`: `user | assistant | dispatch | advisory` (the type notes that this union may widen);
- `display`: `visible | hidden | diagnostic`;
- stable `id`, optional `submissionId`, `turnId`, `signal`, `settlement`, and agent-authored
  `metadata`;
- parts discriminated as `text`, `reasoning`, `data-${string}`, `file`, or `dynamic-tool`; tool
  parts further discriminate `input-available | output-available | output-error`.

The projector maps canonical user messages to `role: 'user', purpose: 'user'`, signals to
`role: 'system', purpose: 'dispatch' | 'advisory'`, and assistant steps/tool outcomes into one
assistant response message (`@flue/runtime/dist/dispatch-nU3cIlT-.mjs:1726-1767,1795-1830,
1911-1988`).

Two limits matter for anchoring:

1. **Contract:** the canonical record schema and child conversations are intentionally not
   exposed; only the default root conversation's materialized messages and update chunks are
   public (`@flue/runtime/docs/reference/streaming-protocol.md:175-185`).
2. **Inference:** `role: 'user'` plus `purpose: 'user'` is an adequate structural true-user
   discriminator against signals and runtime advisories. It does **not** distinguish a typed
   user-affordance reply from any other user delivery. That distinction remains harness-owned
   through the pending-affordance protocol and reply encoding.

The public stable `message.id` is not a canonical sequence number or entry range. Assistant
steps are coalesced, tool results become parts, and compaction records disappear from the
projection. FE-1391 must therefore choose whether the archive pointer stores stable Flue message
IDs or harness-minted archive ordinals/ranges; it cannot derive the spec's current entry range
from a public raw-entry sequence because no such sequence is exposed.

A history snapshot is also materialized **at its read offset**, not an immutable list of finished
objects. Repeated reads may return the same assistant message ID with additional parts or a part
whose state advanced from `streaming` to `done` (`@flue/sdk/dist/index.d.mts:39-49,139-180`).
**Inference:** archive-on-read needs identity-keyed merge/version semantics; blindly appending
each snapshot duplicates messages, while first-write-wins can freeze a partial response. This is
a third FE-1391 implementation decision alongside URL/transport injection and pointer identity.

### Offsets, paging, and the “thousand entries” premise

- **Contract:** offsets are opaque, exclusive resume tokens over durable **batches**, not
  messages. `-1` means before the first batch. Clients must not construct or interpret them
  (`@flue/runtime/docs/reference/streaming-protocol.md:21-34`).
- **Contract:** a history snapshot is one whole materialized snapshot. It has no paging or
  limit parameter (`@flue/sdk/dist/index.d.mts:225-228`).
- **Contract:** one updates response covers at most 100 durable batches; there is no wire
  parameter to change it. Absence of `Stream-Up-To-Date` means continue from
  `Stream-Next-Offset` (`@flue/runtime/docs/reference/streaming-protocol.md:187-203`).
- **Implementation:** the SDK automatically reconnects a non-live stream until it reaches the
  head (`@flue/sdk/dist/index.mjs:717-745,878-885`).
- **Implementation:** the store defaults to 100 batches and clamps an internal adapter read to
  1,000 (`@flue/runtime/dist/stream-offsets-sRUtb-M2.d.mts:29-32`;
  `@flue/runtime/dist/conversation-stream-store-CXwRWonS.mjs:5508-5533,5662-5689`). The HTTP
  handler passes no `limit`, so the wire page is the 100-batch default
  (`@flue/runtime/dist/dispatch-nU3cIlT-.mjs:3144-3160`).

**Verdict:** neither the public contract nor the 2.0.3 handler imposes a thousand-entry limit on
history, and there is no thousand-message limit on updates. This is not a promise of unbounded
response size; it means no semantic count cap is exposed. The suspected number belongs to the
internal store adapter's maximum batch read. For FE-1391 archive-on-read, `history()` avoids
paging entirely. If FE-1391 later consumes updates, the SDK already owns page draining;
hand-built offset arithmetic would diverge from contract.

### Errors and bounds

| Condition | Result | Quality |
| --- | --- | --- |
| Unknown conversation/read before first POST | `404 stream_not_found` | contract + implementation |
| Invalid view, history query combination, missing/repeated/malformed update offset, invalid live mode | `400 invalid_request` | contract + implementation |
| Unsupported method | `405 method_not_allowed` with `Allow` | contract |
| Update offset beyond current head | `416 stream_offset_gone`, with instruction to re-read history | implementation |
| Any non-2xx SDK JSON request | `FlueApiError` with status, parsed body/text, and optional correlation ref | contract + implementation |

Evidence: `@flue/runtime/dist/errors-CsDcT_C4.mjs:383-442`,
`@flue/runtime/dist/dispatch-nU3cIlT-.mjs:3130-3160`, and
`@flue/sdk/dist/index.d.mts:20-35` / `index.mjs:97-121`.

The package-shipped protocol page says an offset beyond head returns `500`
(`streaming-protocol.md:34`), while the installed 2.0.3 handler and typed error implement `416`.
That is a documentation/source discrepancy. Treat `416` as **2.0.3 implementation evidence**,
not a stable public promise, and let `FlueApiError` carry the exact status rather than branching
archive correctness on it.

## B2 — storage ownership and compaction trace

### Durable ownership

The package documentation calls each agent instance's canonical conversation an ordered,
append-only stream and the sole authoritative transcript. State writes live in that same stream;
fold checkpoints are explicitly non-authoritative caches
(`@flue/runtime/docs/guide/database.md:11-21`,
`@flue/runtime/docs/reference/data-persistence-api.md:140-179`). This is the public adapter
**contract**.

The 2.0.3 implementation matches it:

- SQL stores each batch under `(path, seq)` and appends with `INSERT`, then increments the head
  (`@flue/runtime/dist/conversation-stream-store-CXwRWonS.mjs:5302-5333,5635-5657`).
- The in-memory adapter likewise pushes a new batch; reads slice without mutating prior batches
  (`...:5490-5533`).
- `CompactionRecord` carries its own `entryId`, old active `parentId`/`sourceLeafId`, and a
  `firstKeptEntryId`; `StateWriteRecord` is separately defined as last-write-wins state across
  the instance stream (`@flue/runtime/dist/attachment-store-CukHsFkd.d.mts:263-276,318-329`).

### What compaction changes

The implementation trace is decisive:

1. The reducer validates that `firstKeptEntryId` and `sourceLeafId` already exist, then **appends**
   the compaction entry as a child of the active leaf. It deletes no conversation entry
   (`@flue/runtime/dist/dispatch-nU3cIlT-.mjs:538-556`).
2. The compaction runner builds a summarization input from canonical context, generates a
   summary, appends that compaction record with the old active leaf as parent, and rebuilds model
   context (`@flue/runtime/dist/conversation-stream-store-CXwRWonS.mjs:4039-4138`).
3. Only `buildConversationContextEntries` substitutes the latest summary plus kept suffix for
   older messages (`@flue/runtime/dist/dispatch-nU3cIlT-.mjs:698-734`). This function feeds
   `agentLoop.state.messages` (`@flue/runtime/dist/conversation-stream-store-CXwRWonS.mjs:
   3908-3916`).
4. The public history projector takes a different path: it walks the full active path and emits
   every message entry, skipping only non-message entries such as the compaction record
   (`@flue/runtime/dist/dispatch-nU3cIlT-.mjs:1795-1816,2028-2038`). An incremental reader gets a
   `conversation-reset` carrying that same full snapshot when a compaction record lands
   (`...:2040-2053,2092-2094`).

**Inference:** for the installed 2.0.3 graph shape, a history snapshot after compaction contains
the same pre-compaction public messages (and IDs), plus anything appended afterward. Its durable
offset changes because the compaction itself is a durable batch. Compaction rewrites model
context, not durable history.

### What happens to per-session state

`state_write` reduction updates a state map independently of message/compaction handling
(`@flue/runtime/dist/dispatch-nU3cIlT-.mjs:585-587`). Root-harness initialization loads that
reduced state and gives it to the hook state buffer
(`@flue/runtime/dist/builtin-providers-DW08g5fh.mjs:464-480`). The public durability guide also
states that every persistent-state write is a canonical record and survives for the life of the
conversation (`@flue/runtime/docs/guide/durability.md:109-113`).

**Verdict:** compaction preserves the state used for brunch-lite's pending-affordance slot and
future swept high-water mark. The state is scoped to the agent instance/root harness, not to the
model-context message array that compaction rewrites.

## Confidence shift

| Claim | Before | After source read |
| --- | --- | --- |
| A supported conversation read exists | paraphrase-grade | high; public exported types and wire docs |
| Binding can discover its own route/base URL | assumed | contradicted; host owns and must inject it |
| GET exposes raw canonical entries/ranges | assumed | contradicted; public surface is materialized messages |
| A thousand-entry page must be handled | open gap | contradicted; history is unpaged, updates are 100 batches, 1,000 is internal |
| True user can be separated from signals | unverified | high for `role/purpose`; affordance subtype remains harness-owned |
| Compaction might prune durable history | open | high-confidence false for 2.0.3; append-only contract plus direct source trace |
| Compaction might reset persistent state | open | high-confidence false; independent state-write reduction |

The only non-contractual part of the B2 verdict is the exact guarantee that the *public message
projection* remains byte-for-byte stable across compaction. Public docs promise an append-only
canonical source of truth, and implementation makes the projection consequence clear, but they
do not state that consequence as a named compatibility guarantee. That is why a behavioral pin
still has value at Flue upgrades.

The settled elicitation-kernel spec remains the historical decision record, so its §14.5 text
still names the pre-read `>1000` and compaction unknowns. Current truth lives in CONVERGENCE,
the remediation ledger, and `test/open-gaps.ts`. Capability 8's metadata is reconciled in this
change; FE-1391 still owns its implementation.

## Recommendation and residual experiment

Proceed with FE-1391 using the public `FlueConversationSnapshot`/`history()` surface, a
host-supplied conversation URL resolver and optional in-process `fetch`, stable public message
discriminators, and archive-owned pointer identity. Do not consume private canonical record
types or shadow-copy entries from hooks.

Reshape FE-1386 from discovery into the smallest behavioral pin:

1. seed one real runtime conversation with a user message, a signal, an assistant response with
   a tool part, and persistent state;
2. read and retain the complete public `messages` and `settlements` projections plus state;
3. call the public `session.compact()` surface once after enough history exists (it is the same
   compaction path with `reason: 'manual'`; `@flue/runtime/dist/types-CVx9SjIx.d.mts:877-892`
   and `conversation-stream-store-CXwRWonS.mjs:3079-3083`);
4. deep-compare `messages` and `settlements` after compaction (excluding only snapshot
   `offset`/`incarnation`), assert the same state, then assert an FE-1391 archive pointer still
   resolves.

Do not run a broad compaction matrix. One real boundary crossing is enough to pin the source-read
conclusion and satisfy the repository's behavioral-proof rule. If FE-1391 can host that test,
FE-1386 can be canceled after the pin lands; until then, keep it as the narrowly reshaped owner.

## Disposition

- **B1:** resolved; FE-1391 now has three implementation decisions, not substrate unknowns:
  host-injected URL/transport, archive pointer identity, and identity-keyed merge/version
  semantics for repeated materialized snapshots.
- **B2:** source-settled for 2.0.3; open-ended FE-1386 spike canceled in shape, narrow behavioral
  pin retained.
- **No runtime, archive, HTTP, or compaction implementation and no live spike performed.** Only
  capability metadata and planning records were reconciled.

## Implementation follow-through (2026-08-18)

FE-1391 subsequently implemented the source-read recommendation without changing its Flue
contract findings except for one identity distinction found by the real mounted-router test:

- `packages/binding-flue/src/history-reader.ts` consumes only the public SDK `history()` snapshot
  through a host-injected full URL resolver and `fetch`, then archives before returning;
- the host's route/session id and `FlueConversationSnapshot.conversationId` are not equal in the
  actual `start()` lifecycle. The former remains the domain session/archive key; the latter is an
  opaque public-projection identity retained in the materialized snapshot, not reinterpreted as
  the evidence pointer's session id;
- `packages/core/src/session-log.ts` assigns stable one-based archive ordinals, retains distinct
  materialized versions under each public message identity, and derives evidence source from the
  archived entry kind;
- the local binding store provisions a format-versioned target-document record around capture and
  archive state, reads the legacy capture-only shape, and fails loudly when either persisted half
  does not parse;
- caller evidence inputs now contain verbatim quotes only. Application resolves and stores the
  existing session-id-plus-entry-range pointer once; a range or source assertion supplied beside a
  quote is rejected.

The custom-transport reader, evolving-message versioning, latest-match advisory, non-user refusal,
and archive-pointer retrieval are behaviorally pinned under `packages/binding-flue/test`,
`packages/core/test`, and the real mounted-router walking skeleton. The obsolete
`history-projection-paging` gap was removed; the remaining orchestration uncertainty is recorded
more narrowly under FE-1392 as `history-refresh-before-sweep`, because only the settlement caller
can prove that it refreshes the archive immediately before applying sweep output.

The FE-1386 behavioral pin did not fold into FE-1391. A genuine main-conversation compaction is not
reachable from the new read/archive seam without additional test-agent and summarizer setup, which
would widen this slice. Its smallest remaining experiment is unchanged: one real compaction,
deep-compare complete public `messages`/`settlements` except offset/incarnation, assert persistent
state, then resolve a pre-compaction FE-1391 archive pointer.
