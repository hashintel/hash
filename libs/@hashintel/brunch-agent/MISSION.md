# H-6763 successor — automatic whole-net preview in a Petrinaut scratch project

## Status

**Live on `kostandin/h-6763-automatic-petrinaut-draft-preview`.** This branch
stacks on the local FE-1580 reconciliation head and inherits its completed-
transcript authority, one shared Flue conversation, admission idempotency,
half-duplex handoff, canonical speech, and durable Stop behavior. This mission
is a bounded parallel implementation intended to reconcile later with
FE-1575 / Mission 6; it must not copy Mission 6's fixture identity, coherent
bundle, or evidence architecture.

## Imperative

Let a person describe a small process through the existing typed or Voice
Brunch conversation and see the complete elicited Petri net appear
automatically in the currently open empty Petrinaut scratch project. Rendering
must happen as Brunch emits canonical construction calls; the user must not
need to press a Preview, Publish, or Generate button.

This closes the visible H-6763 interview-to-draft loop for one local demo
scenario. It does not claim general workpiece projection, provenance,
revision, remote persistence, or arbitrary SDCPN coverage.

## Throughline

```text
typed input or completed Voice transcript
→ FE-1580 shared panel useChat
→ one browser Flue transport and mounted Brunch ChatAgent
→ scratch-project conversation mode
→ SDCPN modelling skill maintains the elicited account
→ Brunch reads the active empty document
→ Brunch emits canonical Petrinaut construction client tools
→ the existing Petrinaut AI dispatcher validates and applies each mutation
→ the active document handle updates and the canvas renders immediately
→ the demo's existing localStorage mirror persists the resulting net
→ client-tool results resume the same canonical conversation
```

The browser editor remains the mutation authority. OpenAI Realtime remains
only the media/transcription plane and receives no construction tools.

## Proof

1. **Automatic complete scratch-net construction.** A deterministic
   production-path test starts from an empty document, submits one sufficiently
   concrete process description, and observes a non-empty connected net with
   at least two places, one transition, and both input and output arcs. No
   preview/publish/generate action is invoked. Oracle: the Brunch transport,
   Petrinaut panel dispatcher, and final canonical definition in the focused
   browser integration test.
2. **Immediate canonical rendering seam.** Every accepted construction call is
   executed through Petrinaut's existing AI mutation dispatcher against the
   active handle; no direct server-to-canvas write or replacement renderer is
   introduced. Oracle: panel tests proving canonical validation, mutation
   output, and handle state after each tool result.
3. **Voice uses the same route.** Replacing the typed description with one
   completed Voice transcript produces the same construction tool/result
   sequence through FE-1580 path B, with one admitted spoken turn and no direct
   Voice Flue send. Oracle: `voice-preview.integration.test.ts`.
4. **Reload does not duplicate construction.** The local demo persists the
   constructed definition through its existing handle subscription; reopening
   shows one net and canonical history without resubmitting the spoken turn or
   reapplying tool results. Oracle: focused local-storage/history test and a
   local browser witness.
5. **Parent behavior remains intact.** FE-1580's transcript authority,
   half-duplex handoff, exact replay, admission outcomes, question marker, and
   durable Stop suites remain green. Oracle: the existing focused workspace
   tests and type/lint/build checks.

The product witness uses the local Petrinaut Brunch demo, begins with an empty
scratch net, supplies one concrete bounded process, watches the complete small
net appear without another action, and reloads it.

## Constraints

- Keep FE-1580 Voice path B as the only spoken submission path.
- Do not make OpenAI Realtime a modelling agent or expose tools to it.
- Do not add a manual Preview, Publish, Generate, or Finish action.
- Scope automatic construction to a conversation explicitly initialized in
  scratch-project mode; do not mount write tools for unrelated conversations.
- Construct only into an empty scratch document. Refuse automatic whole-net
  construction when user-authored content already exists.
- Use the existing canonical Petrinaut tool schemas and panel dispatcher.
  Brunch must not copy SDCPN field catalogs or mutate document handles.
- Use stable caller-supplied IDs and read the current definition before writes.
- Preserve visible partial progress and tool errors; never label a partial or
  rejected sequence as a completed draft.
- The localStorage demo is the only persistence claim.
- Add no fixture manifest, workpiece store, graph database, workflow engine,
  direct canvas endpoint, or second conversation authority.
- Follow test-first implementation: each new behavior must fail for the missing
  feature before production code is added.

## Fog-line

- The least supported conversation-initialization seam for scratch-project
  mode: first-admission `initialData` or one idempotent preparation signal.
- Whether the installed Flue/provider path preserves all nested inputs needed
  by the selected small uncoloured net. The first tracer deliberately avoids
  coloured type elements, parameters, scenarios, metrics, and executable code.
- Whether the existing full construction subset needs input normalization
  beyond the narrow values exercised by the tracer.
- How the agent should mark completion without adding a second publish
  protocol. The default is settlement after the last successful canonical tool
  result plus ordinary assistant text; canvas visibility does not wait for it.
- The exact deterministic faux-provider sequence and smallest browser witness
  that discriminate a complete connected net from parser-valid empty state.

## Stop or reorient

Stop and report if:

- scratch mode requires a second Voice send path or second conversation;
- the only route is to mount mutation tools for every ordinary Brunch chat;
- construction requires raw whole-net JSON, copied Petrinaut schemas, or a
  direct server-to-handle mutation;
- nested provider input cannot carry the selected simple place, transition, or
  arc calls through the supported Flue tool contract;
- the implementation overwrites a non-empty user document;
- repeated or hydrated tool results apply duplicate entities or arcs;
- a manual preview action becomes necessary; or
- the slice expands into Mission 6 coherent-bundle durability or Mission 9
  general traceable projection.

## Expected touched paths

```text
libs/@hashintel/brunch-agent/packages/plugin-sdcpn/
  scratch conversation mode, bounded construction mounting, focused tests
libs/@hashintel/brunch-agent/packages/transport-aisdk/
  only the minimum initial-data seam if required
apps/petrinaut-website/src/main/app/local-storage-demo/
  scratch-mode selection and construction client-tool catalog
apps/petrinaut-website/src/main/app/voice-interview/
  Voice-through-the-same-route proof only
apps/brunch-agent/test/
  real Flue/client-tool construction tracer
libs/@hashintel/petrinaut/
  only generic dispatcher tests or a source defect exposed by the tracer
```

## Deferred

FE-1575 / Mission 6 owns the prepared workpiece/document fixture, coherent
bundle identity, and two-tab acceptance. Mission 9 owns automatic projection
from a durable workpiece, nested schema breadth, repeat/change semantics,
derivations, provenance, partial-failure policy, and general whole-net
construction. Before this branch is proposed for merge, compare it with Lu's
latest Mission 6 head and either reconcile the smallest shared mechanisms or
keep it explicitly temporary.
