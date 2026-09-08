# A3 integration-owner patch requests

These are proposals for the owner-held production join, not edits applied by A3. No carrier, catalogue, plugin `flue.ts`, ChatAgent composition, website transport/registration, settled-manifest or planning file changed. Read alongside `browser-witness.md`; this is not a claim that the following join already exists.

## 1. Mount the synchronous executor on the existing website

File: `apps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.tsx`.

Add the import:

```ts
import { createBrowserTransitionRecorder } from "./transition-record";
```

Create one recorder for the selected active handle and bound conversation, alongside the existing conversation tracker. The exact factory call is:

```ts
createBrowserTransitionRecorder({
  handle: activeHandle.handle,
  binding: { conversationId, documentId: activeHandle.netId, incarnationId },
  requestFor: (toolCallId) => issuedArcRequests.get(toolCallId),
});
```

Here `incarnationId` and `issuedArcRequests` explicitly denote **join-owned inputs still to be supplied**, not existing symbols or a ready-to-apply patch. `requestFor` must return `ArcMutationRequest` or throw if unknown; a JavaScript `Map.get()` therefore needs an explicit missing-entry check. It must resolve the issued call's canonical normalized input, original requested base hash and bound identity, not synthesize them from `handle.doc()` when execution starts. The recorder itself copies its binding and each request. Keep its lifetime stable over rerenders and output-insertion retries; replace it when the bound handle/incarnation or conversation changes, and seed verified retained outcomes before admitting reopened pending work. The existing local-storage record and prepared manifest do not yet carry an incarnation field; don't use `lastUpdated` as identity or silently create an incarnation on every render.

In the existing `aiAssistant` object, add only when that bound Brunch recorder is selected:

```ts
...(transitionRecorder === undefined
  ? {}
  : { executeMutation: transitionRecorder.executeMutation }),
```

Include that stable recorder in the existing memo dependencies. Keep it absent for stock assistant mode. This recorder deliberately refuses everything except the root `addArc` request shape exercised by the prepared fixture. Do not install it over a broader catalogue and silently pass unrecorded mutations through. No new catalogue mount is needed for the already-available prepared fixture arc.

## 2. Carry the record with the already-correlated client result

Files/seams: website `brunch-panel-transport.ts`; generic transport `packages/transport-aisdk/src/index.ts` only if its existing result projection needs the smallest generic extension; the integration-owned ChatAgent/basis join and history projection.

At the existing outgoing client-result serialization boundary, retrieve the recorder's record by the same `toolCallId`. Preserve the canonical normalized tool input, `toolCallId`, `toolName`, original canonical result value, and current causal per-step result order. Do not add an independent hidden submission or second history store. Carry the record alongside that canonical result through the existing `client-tool-result` signal; the precise envelope is integration-owned. `completedClientToolResults()` currently selects the most recent client-tool step and forwards `part.output`, and `clientToolHistoryFrom()` projects only `toolCallId`, `toolName`, `output`. Do not undo those causal-step rules while adding a projection for records.

The receiving join must match the authenticated conversation, issued request and bound document/incarnation **before** accepting a record. `verifyArcTransitionAttempt(delivery)` returns a detached, hash/diff-verified attempt; it is an integrity check, not proof that an arbitrary caller controls the browser document. `reconcileArcTransitionAttempts()` consumes verified attempts for one call. Keep every delivery; if any valid delivery conflicts with the first, the record outcome is sticky `unknown`. Use the record outcome, not an individual earlier `applied` attempt, for causal explanation. `createBrowserTransitionRecorder.acceptDelivery()` additionally checks the issued request and its captured binding and prevents later execution of a call already observed externally; it does not manufacture the canonical output needed for history recovery.

No record, workpiece, basis payload or signal body goes into automatic speech. Existing canonical assistant-prose selection remains authoritative. The joined transport must retain existing matching-call error, admission-ambiguity/no-retry and output-insertion lifetime tests.

## 3. Join A2 basis, without broadening A3

`ArcMutationRequest` deliberately has no invented settled revision/basis implementation. Project its fields from the joined request envelope and strip that envelope before the canonical mutation reaches Petrinaut. Keep declared basis beside the record in canonical history. A3 paths are snapshot-relative JSON pointers with complete changed subtree values, not revision locators, global entity epochs or introduced-by passage identities.

`created`, `updated`, and `deleted` identify changes at the requested root arc; `derived` contains all other changed paths as explicitly unmapped residual effects. Any such residual causes `unknown` in this narrow implementation and receives no request basis. A2/A5 must not interpret array indexes as durable IDs or claim an unanticipated sanitizer effect was supported by every request locator. Earn any required sanitizer mapping at an actual browser boundary before admitting it.

## 4. Exact remaining integration oracle

Implement `apps/brunch-agent/test/transition-records.integration.ts` and its discoverable wrapper on the joined branch, preserving the assertion: **“correlates the real browser transition record and resumes without reapplying.”** It is intentionally not implemented here as a misleading headless stand-in or skipped pass. Exercise the existing built production ChatAgent mount with a controlled provider and the actual browser handle/registered executor. Compare the record's call ID and canonical input/result against public history, retain browser pre/post definitions, then verify a duplicate delivery does not invoke the mutation again. Repeat protected Voice/Stop regressions through the joined record payload, including held output insertion and conversation replacement.

No paid calls are authorized for this join. A later real-provider browser run needs the owner's reservation and complete live baseline including A2's revision tool. No Step A acceptance or Step B authority follows from this branch.
