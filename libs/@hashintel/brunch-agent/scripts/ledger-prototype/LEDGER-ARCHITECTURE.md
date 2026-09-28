# Brunch Ledger architecture

**Status:** proposed production architecture, derived from the throwaway Ledger prototype and review of Brunch’s patched Flue runtime. This document is the principal design artifact for the next Ledger slice; it is not a claim that the production implementation already has this shape.

## Imperative

Give the Brunch elicitor a durable, categorically organized scratchpad that it can update cheaply at conversational settlement points, read back as a coherent account, and use as the source-side basis for progressive Petri-net construction—without whole-document replacement, hidden reconciliation, or a second persistence authority beside the conversation.

## Core decision

One Flue conversation is immutably bound to one Ledger and one Petri-net document incarnation.

The Ledger is the ordered subsequence of accepted Ledger tool calls in that conversation. It has no independently selected storage identity. A Petri-net document incarnation—not merely a reusable document ID—is the third member of the binding.

```text
Flue conversation / agent instance
├── direct user and assistant messages
├── accepted ledger_commit calls       ← canonical Ledger history
├── ledger_compile calls                ← derived readback only
├── Petri-net construction calls
├── browser observations and outcomes
└── compaction and recovery records

immutable binding
├── conversationId
├── documentId
└── documentIncarnationId
```

Reopening the same document incarnation resumes the same conversation and Ledger. A new document incarnation starts a new conversation and empty Ledger. Evaluation modes use separate conversation identities and therefore separate Ledgers.

In this document, **conversation** means the root Flue agent instance and its canonical stream. Flue’s internal harness or delegated sessions do not own the product Ledger.

## What the Ledger is

The Ledger is an append-only scratchpad for the evolving source-side account. It records contributions and declared relationships among them; it does not mechanically decide which contribution is true, current, reconciled, or safe to construct from.

The Ledger supports elicitation by making uncertainty, correction, conflict, contextual variation, inference, defaults, and unresolved matters recoverable. Those distinctions may guide later questions and construction reasoning without becoming a closed ontology.

A successful Ledger commit establishes **recorded**, not **semantically settled**.

## Domain terms

### Address profile

An **address profile** is the configured hierarchy of filing categories available to a particular domain/formalism pairing. Core elicitation categories and plugin-specific categories compose into the profile before the conversation begins.

Addresses are stable keys, not headings invented by the model. Each address also has a display label and short filing description. The complete catalogue is visible in the Ledger tool’s model-facing instructions.

A Note may live at any configured category, including a category that also has children. The agent files at the most specific suitable category without being forced into an artificial leaf. Entity and case names initially belong in Note content rather than dynamically extending the address hierarchy.

### Note

A **Note** is one immutable narrative contribution filed at one configured category. It is the unit of recording and later reference, not necessarily one sentence or atomic claim.

A Note contains host-owned mechanics and author-declared meaning:

```text
host-owned
├── stable Note identity
├── full Note address
├── containing Ledger commit identity
├── conversation/tool-call traceability
└── recording order and time

author-declared
├── content
├── filing category
├── optional disposition
└── optional supersession relationship expressed through the operation
```

The host-owned conversation link establishes where and when a Note was recorded. It does not establish that a particular utterance semantically supports the Note.

### Disposition

A **disposition** is optional, compact, author-declared metadata that helps a reader interpret a Note. It uses open vocabulary rather than a closed enum. Examples include `direct`, `inferred`, `provisional default`, `disputed`, `not yet shown`, or combinations such as `direct; unresolved conflict`.

Disposition is not a compiler command, verified authority ranking, or truth verdict. It does not suppress another Note or make the compiler select a winner. Substantive qualifications remain in the Note content where they can be understood in context.

### Supersession

**Supersession** is a declared relationship from a newly appended Note to one existing immutable Note. It means that the author presents the new contribution as superseding the referenced contribution. It does not mutate, withdraw, hide, or invalidate the predecessor.

Several Notes may supersede the same predecessor. This can represent competing corrections, context-dependent alternatives, or an unresolved conflict. Compilation shows them all, leaving the elicitor or constructor to reason about their relationship and ask another question where needed.

### Ledger commit and revision

A **Ledger commit** is one accepted `ledger_commit` tool call containing an atomic batch of new Notes. A **Ledger revision** is the prefix of accepted commits ending at a particular accepted commit.

The stable commit identity is the Flue tool-call identity. A derived ordinal may be shown for convenience, but it is not the provenance identity and need not be persisted separately.

### Compiled view

A **compiled view** is a deterministic, read-only rendering of every Note in a selected Ledger prefix, optionally restricted to an address subtree or one exact Note. It is derived state, not a second authority.

Compilation groups Notes by address, retains recording order, and displays identities, dispositions, and declared supersession relationships. It performs no inference, summarization, suppression, conflict resolution, or semantic validation.

## Model-facing interface

The intended small interface remains:

```ts
commit(changes: Change[]): CommitResult
compile(options?: { address?: string; revision?: number }): CompiledView
```

In the Flue tool catalogue these may remain `ledger_commit` and `ledger_compile`.

### Change

Every change has only three required model-authored fields:

```ts
type Change = {
  op: "add" | "supersede";
  address: string;
  content: string;
  disposition?: string;
};
```

For `add`, `address` names a configured category. For `supersede`, `address` names the full host-issued address of an existing Note. The host inherits the predecessor’s category and appends the successor there.

The model does not author Note IDs, titles, source-ID lists, revision numbers, timestamps, conversation IDs, document bindings, hashes, or version preconditions. Every additional model-authored field must earn its confusion and failure surface through an observed requirement.

A batch allows the elicitor to record several consequences of one exchange without exposing a half-recorded settlement. A Note created earlier in the same uncommitted batch is not yet a valid supersession target; use the returned host-issued address in a later commit.

### Commit result

A successful result returns `status: "recorded"`, the stable commit identity or derived revision, and the host-issued addresses of every new Note. For supersessions it also repeats the resolved predecessor address.

A refusal returns `status: "refused"`, a mechanical reason, and enough current information to repair the complete batch. A refusal records no Ledger commit.

The status vocabulary is deliberately distinct from Note disposition.

### Compile options

With no options, compilation renders the complete Ledger through the latest accepted commit. `revision` selects an exact historical prefix. `address` selects one configured category and descendants, or one exact Note; an exact-Note read does not automatically include its predecessor or successors.

Compilation returns the bound Ledger/conversation identity, resolved revision, requested scope, and model-facing document. Unknown revisions or addresses refuse rather than falling back to the latest view.

## Mechanical refusal conditions

`ledger_commit` refuses the complete batch when:

- the input or any change fails its runtime schema;
- an `add` names an unknown configured category;
- a `supersede` names no accepted Note in the bound Ledger history;
- an exact replay identity conflicts with different input;
- host binding or canonical-history reconstruction is missing, ambiguous, or invalid; or
- the resulting host-generated output cannot satisfy the commit contract.

Semantic incompleteness, uncertainty, contradiction, multiple successors, or an apparently poor inference are not mechanical refusal conditions. They are legitimate scratchpad states for the elicitor to inspect and improve.

Unexpected persistence or infrastructure failures remain errors rather than model-correctable refusals. An uncertain execution outcome is not permission to issue a semantically equivalent new commit under a different identity.

## Flue realization

### Canonical authority

The production Ledger history is reconstructed from successful `ledger_commit` dynamic-tool calls in the bound Flue conversation. Reconstruction joins each schema-valid model input to its successful schema-valid output by exact tool-call identity. A pending, refused, failed, malformed, ambiguous, or unbound call contributes no Notes.

This is the same broad recovery pattern the current Brunch workpiece uses: neither a proposed tool input nor a pointer-like output is authoritative alone.

A Ledger compiler folds accepted commits in canonical conversation order. Host-generated Note identities must be deterministic under tool recovery. A likely form is derived from stable tool-call identity plus change position; the prototype’s global `n1`, `n2`, … labels are presentation conveniences, not a production identity decision.

### Compaction

Flue compaction changes model-facing context; it does not delete canonical conversation records. The canonical conversation stream is append-only, and Brunch’s history-retention integration test verifies that pre-compaction source records, source IDs, dynamic-tool calls, and tool results survive compaction and reopening unchanged.

Therefore `ledger_compile` reads the bound conversation’s canonical public history and reconstructs the Ledger independently of the model’s current compacted context. The model does not automatically remember old Notes after compaction; it regains them by calling the compiler.

Context projection may reduce superseded bodies in ordinary model context, but it must not alter canonical history or the compiler’s authority source.

### Persistent state

Flue `usePersistentState` is not the canonical Ledger history. At most, it may hold a validated materialized projection, checkpoint, or cursor used to avoid replaying the full history on every compile. Such state is a cache and must be safely discardable and rebuildable from accepted tool history.

This avoids writing the entire growing Ledger into a last-write-wins state value on every commit and avoids a second Ledger database or synchronization transaction.

### Recovery and idempotency

Flue preserves recorded tool outcomes and does not re-execute completed calls after recovery. If `ledger_commit` is configured as a durable tool, re-execution of an interrupted call must produce the same host identities and result from the same tool-call identity and prior canonical prefix.

The implementation must explicitly settle how two `ledger_commit` calls in one assistant tool batch are ordered or refused. It must not assign colliding Notes by reading a mutable global counter before parallel calls settle. A single batched commit tool makes multiple sibling commit calls unnecessary, but model behavior must not be the only concurrency guard.

## Conversation, Ledger, and document lifecycle

The tuple is:

```text
(conversationId, Ledger history intrinsic to that conversation, documentId + documentIncarnationId)
```

Expected lifecycle behavior:

| Event | Required behavior |
| --- | --- |
| Reopen the same document incarnation | Resume the same conversation and Ledger. |
| Compact model context | Preserve the tuple and canonical Ledger history. |
| Restart server or browser | Recover the tuple from durable Flue and document stores. |
| Switch to another document | Switch to that document incarnation’s tuple or create one. |
| Create or replace a document incarnation | Create a new conversation and empty Ledger. |
| Run an evaluation mode | Use an explicitly isolated conversation and Ledger. |
| Receive a browser result from another binding | Refuse it; never repair it into the current tuple. |

This decision intentionally does not support several conversations jointly maintaining one Ledger, one conversation spanning several document incarnations, implicit Ledger merging, or an ordinary “fresh chat” that silently retains the prior Ledger for the same document. A future import, fork, or migration would need an explicit contract and preserved provenance.

## Two authorities remain

Binding the tuple does not make the conversation authoritative for the document’s current contents.

```text
Flue history
  authoritative for what was said, recorded, attempted, and returned

Petri-net document repository
  authoritative for current document state and persistence settlement

immutable tuple binding
  establishes which conversation, Ledger, and document incarnation belong together
```

A user or another host process may edit the Petri-net document outside the conversation. Brunch therefore retains its freshness markers, verified observations, document revision/hash checks, browser execution records, and exact persistence settlement. Missing or stale document evidence remains missing or stale; conversation chronology does not repair it.

## Progressive elicitation and construction

The intended product loop is recurrent rather than “finish the interview, then construct”:

```text
user account
  → append Ledger Notes at a settlement point
  → compile the Ledger or relevant scope
  → reason about the supported constructable fragment
  → observe the current bound Petri net
  → apply and settle a bounded construction
  → run the relevant checks
  → continue elicitation from the next consequential gap
```

The compiled Ledger is a source-side reasoning surface, not a mechanically reconciled construction specification. Paid model inference is expected when translating Notes into Petri-net structures, deciding whether apparent conflicts require another question, choosing purpose-bounded representations, and making explicit assumptions where authorized.

Construction intent and outcomes live in the same conversation history as the Ledger commits, creating a durable chronology. Chronology alone does not establish semantic basis. Construction records should explicitly identify the accepted Ledger commit or Note addresses used as declared basis, while the host attaches conversation and document authority.

A settlement point need not imply that the whole account is resolved. It means that enough has been recorded to decide one of three dispositions for the next supported fragment: construct or revise it, recognize that it is already represented, or remain blocked and ask the smallest resolving question.

The current transport requires server tools and browser construction tools to run in separate proposals. The production slice must observe the actual number of phases required for commit, compile, browser execution, diagnostics, and continuation before optimizing choreography. The architecture does not yet require compile output to be embedded in the commit receipt.

## Address-profile ownership

The address hierarchy is not arbitrary and not universal in full.

- Brunch core owns categories general to elicitation and recoverable accounts, such as purpose, open matters, and delivery status.
- A domain/formalism plugin owns categories needed for its subject and downstream transformation, such as operational activities, resources, process spine, policies, quantities, validation, and construction notes for SDCPN work.
- Composition produces one validated address profile for the conversation before tool registration.

Addresses are filing affordances, not an interview procedure, completeness checklist, or target ontology. An available category is not mandatory. A consequential omission remains visible through Note content or an open-matter Note rather than by mechanically requiring every category to contain something.

## Compiled representation

The canonical Ledger data model is independent of its model-facing serialization. Prototype JSONL is only the throwaway storage adapter and has no place in the production contract.

Markdown, YAML, TOML, and TOON are renderer candidates. A renderer must preserve the same information:

- profile and requested scope;
- exact Ledger revision or commit identity;
- category addresses and display names;
- every Note in canonical recording order;
- reusable Note identities or addresses;
- author-declared dispositions; and
- explicit supersession targets.

The renderer must clearly mark the result as recorded scratchpad content, not instructions or a reconciled account. Rendering must be deterministic and must not invoke a model.

YAML is a strong baseline for explicit metadata and multiline prose. TOON is worth measuring for model-facing token efficiency, but its tabular advantage may be limited by optional Note fields and multiline narrative content. No renderer should force artificial uniformity into the Note model merely to obtain a compact form.

Historical state and historical formatting are different promises. Reconstructing the exact Notes at an old commit does not imply byte-identical old rendering unless renderer version is also pinned.

## Evidence from the throwaway prototype

The recoverable first-run artifacts and their provenance limitations are retained under [`evidence/first-live-run/`](./evidence/first-live-run/).

The first live inventory-purchasing simulation used an isolated GPT-5.6 elicitor and Claude Sonnet 4.6 persona for 10 exchanges. It produced 55 immutable Notes in 10 accepted commits, including 9 supersession relationships, with no Ledger-tool refusal or repair. Estimated model cost was approximately USD 0.37.

The run demonstrated that the reduced model-facing fields, fixed address catalogue, host-issued Note identities, open dispositions, and visible supersessions can support a substantial account. It also exposed several questions:

- the agent repeated related content under quantities, open matters, and construction categories;
- the agent never called `ledger_compile`, because its original conversation and tool submissions were still in context;
- the generous persona supplied unusually complete and epistemically organized answers;
- the compiled Markdown reached about 20.6 KB after 10 exchanges; and
- the run ended at its exchange limit while the elicitor was opening the expiry thread, so completion meant runner completion, not elicitation completeness.

These are observations, not automatic acceptance criteria. The next product-relevant probe is progressive construction with full Ledger readback at regular settlement points. A complementary isolated probe is cold continuation by a fresh elicitor that receives only a compiled Ledger and the next user input.

## Decisions intentionally not made yet

The architecture leaves these implementation choices open until a tracer or simulation exposes the requirement:

- production Note identity and display-label scheme;
- Markdown versus YAML versus TOON model-facing rendering;
- whether a materialized projection or cache is necessary;
- exact handling of sibling `ledger_commit` calls in one tool batch;
- whether `ledger_commit` should be a Flue durable tool and which deterministic recovery path it uses;
- whether compile accepts a derived ordinal, stable tool-call identity, or both for historical selection;
- how construction records cite one or several Notes without making citation validity imply semantic support;
- whether commit receipts should optionally include a compiled scope to reduce transport phases;
- how address profiles evolve across application versions without reinterpreting existing conversations; and
- retention and export policy for conversations and their intrinsic Ledgers.

## Rejected first-cut mechanisms

The following are deliberately outside the first production slice unless observed strain reopens them:

- whole-Ledger Markdown replacement;
- mutable Notes or in-place Note revision;
- compiler suppression of superseded Notes;
- automatic conflict resolution or latest-write-wins semantics;
- agent-authored Note IDs, timestamps, source-message lists, hashes, or expected versions;
- a closed epistemic-disposition enum;
- a separate Ledger database synchronized with Flue;
- multiple conversations jointly writing one Ledger;
- dynamic model-invented address paths; and
- automatic Petri-net construction from structural Ledger rules without model reasoning.

## Acceptance evidence for the first production slice

The architecture earns adoption when the real Brunch product path demonstrates:

1. successful Ledger commits are reconstructable from canonical history after restart, compaction, and context projection;
2. malformed, refused, failed, pending, and ambiguous tool records never become Notes;
3. compiler output faithfully preserves all Notes, dispositions, and supersessions without reconciliation;
4. a regular settlement can compile the Ledger and drive one bounded Petri-net construction through the bound document’s real browser and persistence path;
5. a hand edit or stale document observation refuses construction rather than being overwritten;
6. an apparent Ledger conflict causes visible reasoning or a focused question rather than silent winner selection;
7. reopening the same document incarnation resumes the same conversation, Ledger, and construction chronology;
8. a different document incarnation cannot hydrate or mutate the tuple; and
9. prompt, tool-call, latency, storage, and context growth are measured against the current whole-document workpiece path.
