# Voice Turn Settlement Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Voice output and physical microphone state correct when canonical response settlement races with playback or ends without speech.

**Architecture:** Preserve the output state owned by realtime session events when the bridge settles a canonical response. Centralize physical microphone restoration behind a guard that requires listening input, settled output, no active response, and no cancellation or handoff still in flight.

**Tech Stack:** TypeScript, Vitest, Yarn workspaces, OpenAI Realtime session events

## Global Constraints

- Limit changes to the two active Bugbot findings on PR #9531.
- Keep paused behavior unchanged.
- Keep capture closed while speech, output cancellation, or turn handoff can still own it.
- Do not change CI configuration to make checks pass.

---

### Task 1: Reconcile Voice settlement with output and capture

**Files:**

- Modify: `apps/petrinaut-website/src/main/app/voice-interview/voice-turn-controller.ts:611-650`
- Modify: `apps/petrinaut-website/src/main/app/voice-interview/voice-turn-controller.ts:709-756`
- Modify: `apps/petrinaut-website/src/main/app/voice-interview/voice-turn-controller.ts:830-880`
- Test: `apps/petrinaut-website/src/main/app/voice-interview/voice-turn-controller.test.ts:725-824`

**Interfaces:**

- Consumes: `VoiceTurnSnapshot`, `RealtimeBrunchBridgeEvent`, and `OpenAIRealtimeSessionEvent`
- Produces: private `#restoreMicrophoneIfCaptureAvailable(): void`

- [ ] **Step 1: Add failing regression coverage**

Extend the stopped-submission test to clear prior microphone calls immediately
after `submission-started` and assert that settlement re-applies the enabled
preference:

```ts
harness.emitBridge({
  answer: "Stop this one.",
  deliveryId: "voice-1",
  type: "submission-started",
});
harness.session.setMicrophoneEnabled.mockClear();
// Existing accepted, settled, and stopped bridge events remain here.
expect(harness.session.setMicrophoneEnabled).toHaveBeenCalledOnce();
expect(harness.session.setMicrophoneEnabled).toHaveBeenCalledWith(true);
```

Add a test for playback that fully settles before canonical response
settlement:

```ts
test("keeps finished early speech idle and restores capture after canonical settlement", async () => {
  const harness = createHarness();
  const nextQuestion = markedQuestion("ask-early", "Who acts next?");
  await harness.controller.start();
  harness.emitBridge({
    answer: "The supervisor approves it.",
    deliveryId: "call-early",
    type: "submission-started",
  });
  harness.emitBridge({
    answer: "The supervisor approves it.",
    deliveryId: "call-early",
    type: "submission-accepted",
  });
  harness.session.setMicrophoneEnabled.mockClear();
  harness.emitSession({
    connectionEpoch: 1,
    speechRequestId: "speech-early",
    type: "canonical-speech-requested",
  });
  harness.emitSession({
    connectionEpoch: 1,
    responseId: "response-early",
    speechRequestId: "speech-early",
    type: "output-started",
  });
  harness.emitSession({
    connectionEpoch: 1,
    responseId: "response-early",
    status: "completed",
    type: "response-terminal",
  });
  harness.emitSession({
    connectionEpoch: 1,
    responseId: "response-early",
    type: "output-stopped",
  });

  harness.emitBridge({
    deliveryId: "call-early",
    questionSegment: nextQuestion,
    segments: [nextQuestion],
    type: "canonical-response-ready",
  });

  expect(harness.controller.getSnapshot()).toMatchObject({
    canReadFullResponse: true,
    canRepeatQuestion: true,
    input: "listening",
    output: "idle",
  });
  expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
});
```

Add a test proving settlement does not hide in-flight playback:

```ts
test("preserves speaking output when canonical settlement arrives during playback", async () => {
  const harness = createHarness();
  const nextQuestion = markedQuestion("ask-playing", "Who acts next?");
  await harness.controller.start();
  harness.emitBridge({
    answer: "The supervisor approves it.",
    deliveryId: "call-playing",
    type: "submission-started",
  });
  harness.emitSession({
    connectionEpoch: 1,
    speechRequestId: "speech-playing",
    type: "canonical-speech-requested",
  });
  harness.emitSession({
    connectionEpoch: 1,
    responseId: "response-playing",
    speechRequestId: "speech-playing",
    type: "output-started",
  });
  harness.session.setMicrophoneEnabled.mockClear();

  harness.emitBridge({
    deliveryId: "call-playing",
    questionSegment: nextQuestion,
    segments: [nextQuestion],
    type: "canonical-response-ready",
  });

  expect(harness.controller.getSnapshot()).toMatchObject({
    canReadFullResponse: false,
    canRepeatQuestion: false,
    input: "listening",
    output: "speaking",
  });
  expect(harness.session.setMicrophoneEnabled).not.toHaveBeenCalledWith(true);

  harness.emitSession({
    connectionEpoch: 1,
    responseId: "response-playing",
    status: "completed",
    type: "response-terminal",
  });
  harness.emitSession({
    connectionEpoch: 1,
    responseId: "response-playing",
    type: "output-stopped",
  });

  expect(harness.controller.getSnapshot()).toMatchObject({
    canReadFullResponse: true,
    canRepeatQuestion: true,
    output: "idle",
  });
  expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
});
```

Add a test proving a cancelled reply waits for provider cancellation before
restoring capture:

```ts
test("restores capture after a cancelled reply finishes provider cancellation", async () => {
  const harness = createHarness();
  let finishCancellation: (() => void) | undefined;
  await harness.controller.start();
  harness.emitBridge({
    answer: "Cancel this reply.",
    deliveryId: "call-cancelled",
    type: "submission-started",
  });
  harness.session.cancelOutput.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishCancellation = resolve;
      }),
  );
  harness.controller.cancelPendingSpeech();
  harness.session.setMicrophoneEnabled.mockClear();

  harness.emitBridge({
    deliveryId: "call-cancelled",
    segments: [],
    speechCancelled: true,
    type: "canonical-response-ready",
  });

  expect(harness.controller.getSnapshot()).toMatchObject({
    input: "listening",
    output: "interrupted",
  });
  expect(harness.session.setMicrophoneEnabled).not.toHaveBeenCalledWith(true);

  finishCancellation?.();
  await Promise.resolve();

  expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
yarn workspace @apps/petrinaut-website test:unit src/main/app/voice-interview/voice-turn-controller.test.ts
```

Expected: the new assertions fail because stopped and settled responses do not
restore capture, and canonical settlement overwrites `idle` or `speaking` with
`waiting-for-tool`.

- [ ] **Step 3: Implement guarded microphone restoration**

Add this helper next to `#clearSettledSpeech`:

```ts
#restoreMicrophoneIfCaptureAvailable(): void {
  if (
    this.#snapshot.connection === "connected" &&
    this.#snapshot.input === "listening" &&
    this.#activeSpeechResponseId === null &&
    this.#takingTurnPromise === null &&
    this.#outputCancellationPromise === null &&
    (this.#snapshot.output === "idle" ||
      this.#snapshot.output === "interrupted")
  ) {
    this.#session.setMicrophoneEnabled(this.#snapshot.microphoneEnabled);
  }
}
```

Make `#clearSettledSpeech` responsible only for clearing lifecycle fields:

```ts
#clearSettledSpeech(): void {
  this.#activeSpeechOutputEnded = false;
  this.#activeSpeechResponseId = null;
  this.#activeSpeechResponseTerminal = false;
}
```

After updating `output` in each of `output-stopped`,
`output-interrupted`, and `response-terminal`, call:

```ts
this.#restoreMicrophoneIfCaptureAvailable();
```

When `#cancelOutput` resolves and clears its matching promise, call the same
helper:

```ts
if (this.#outputCancellationPromise === cancellationPromise) {
  this.#outputCancellationPromise = null;
  this.#restoreMicrophoneIfCaptureAvailable();
}
```

- [ ] **Step 4: Reconcile bridge settlement without overwriting output**

After the `submission-stopped` snapshot update, call:

```ts
this.#restoreMicrophoneIfCaptureAvailable();
```

Do the same after the `speechCancelled` snapshot update. For the normal
canonical response branch, preserve the current output state and then restore
capture only if the helper's guards permit it:

```ts
this.#update({
  input: paused ? "paused" : "listening",
  output: paused ? "interrupted" : this.#snapshot.output,
});
this.#restoreMicrophoneIfCaptureAvailable();
```

- [ ] **Step 5: Run focused and package verification**

Run:

```bash
yarn workspace @apps/petrinaut-website test:unit src/main/app/voice-interview/voice-turn-controller.test.ts
yarn workspace @apps/petrinaut-website lint:tsc
yarn workspace @apps/petrinaut-website lint:eslint
git diff --check
```

Expected: every command exits with status 0 and the controller test reports all
tests passing.

- [ ] **Step 6: Commit the controller fix**

```bash
git add \
  apps/petrinaut-website/src/main/app/voice-interview/voice-turn-controller.ts \
  apps/petrinaut-website/src/main/app/voice-interview/voice-turn-controller.test.ts \
  docs/superpowers/plans/2026-09-06-voice-turn-settlement-reconciliation.md
git commit -m "Reconcile Voice response settlement with playback"
```

### Task 2: Resolve review threads and continue the PR checks loop

**Files:**

- No source files unless a current CI log demonstrates another PR-caused failure.

**Interfaces:**

- Consumes: committed controller fix and live GitHub review/check state
- Produces: resolved Bugbot threads and a fresh CI diagnosis

- [ ] **Step 1: Push the verified commits**

```bash
git push origin kostandin/fe-1580-harden-voice-safety-and-ux-on-the-unified-flue-route
```

- [ ] **Step 2: Reply to the two Bugbot threads**

```bash
gh api \
  --method POST \
  repos/hashintel/hash/pulls/9531/comments/3938035918/replies \
  -f body='Fixed. Returning to listening now restores the saved microphone preference only after playback and provider cancellation have settled.'
gh api \
  --method POST \
  repos/hashintel/hash/pulls/9531/comments/3938035920/replies \
  -f body='Fixed. Canonical settlement now preserves the session-owned output state, so finished playback remains idle and in-flight playback remains speaking.'
```

- [ ] **Step 3: Resolve the fixed review threads**

```bash
gh api graphql \
  -f threadId='PRRT_kwDOC75-is6fcqv_' \
  -f query='mutation($threadId:ID!){resolveReviewThread(input:{threadId:$threadId}){thread{isResolved}}}'
gh api graphql \
  -f threadId='PRRT_kwDOC75-is6fcqwB' \
  -f query='mutation($threadId:ID!){resolveReviewThread(input:{threadId:$threadId}){thread{isResolved}}}'
```

- [ ] **Step 4: Refresh checks and inspect the failed Playwright log**

```bash
gh pr checks 9531 --repo hashintel/hash
gh run view 33903037522 \
  --repo hashintel/hash \
  --job 101121574919 \
  --log
```

Expected: use the log's first underlying test failure, not the aggregate
`Tests passed` job, as the next root-cause investigation input.

### Task 3: Keep queued canonical speech in the waiting state

**Files:**

- Modify: `apps/petrinaut-website/src/main/app/voice-interview/voice-turn-controller.ts:684-698`
- Test: `apps/petrinaut-website/src/main/app/voice-interview/voice-turn-controller.test.ts:829-939`

**Interfaces:**

- Consumes: the existing `canonical-speech-requested` session event
- Produces: `waiting-for-tool` output state until the requested response starts

- [ ] **Step 1: Add a failing queued-speech regression test**

```ts
test("keeps capture closed when more canonical speech starts at settlement", async () => {
  const harness = createHarness();
  const finalSegment = markedQuestion("ask-final", "Who acts next?");
  await harness.controller.start();
  harness.emitBridge({
    answer: "The supervisor approves it.",
    deliveryId: "call-queued",
    type: "submission-started",
  });
  harness.emitSession({
    connectionEpoch: 1,
    speechRequestId: "speech-early",
    type: "canonical-speech-requested",
  });
  harness.emitSession({
    connectionEpoch: 1,
    responseId: "response-early",
    speechRequestId: "speech-early",
    type: "output-started",
  });
  harness.emitSession({
    connectionEpoch: 1,
    responseId: "response-early",
    status: "completed",
    type: "response-terminal",
  });
  harness.emitSession({
    connectionEpoch: 1,
    responseId: "response-early",
    type: "output-stopped",
  });
  harness.session.setMicrophoneEnabled.mockClear();

  harness.emitSession({
    connectionEpoch: 1,
    speechRequestId: "speech-final",
    type: "canonical-speech-requested",
  });
  harness.emitBridge({
    deliveryId: "call-queued",
    questionSegment: finalSegment,
    segments: [finalSegment],
    type: "canonical-response-ready",
  });

  expect(harness.controller.getSnapshot()).toMatchObject({
    canReadFullResponse: false,
    canRepeatQuestion: false,
    input: "listening",
    output: "waiting-for-tool",
  });
  expect(harness.session.setMicrophoneEnabled).not.toHaveBeenCalledWith(true);

  harness.emitSession({
    connectionEpoch: 1,
    responseId: "response-final",
    speechRequestId: "speech-final",
    type: "output-started",
  });
  harness.emitSession({
    connectionEpoch: 1,
    responseId: "response-final",
    status: "completed",
    type: "response-terminal",
  });
  harness.emitSession({
    connectionEpoch: 1,
    responseId: "response-final",
    type: "output-stopped",
  });

  expect(harness.controller.getSnapshot()).toMatchObject({
    canReadFullResponse: true,
    canRepeatQuestion: true,
    output: "idle",
  });
  expect(harness.session.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
yarn workspace @apps/petrinaut-website test:unit src/main/app/voice-interview/voice-turn-controller.test.ts
```

Expected: the new test fails because canonical settlement preserves `idle`,
enables replay, and reopens capture after the second speech request.

- [ ] **Step 3: Mark requested canonical speech as waiting**

Update the existing `canonical-speech-requested` snapshot transition:

```ts
this.#update({ output: "waiting-for-tool", partialText: "" });
```

This event is emitted when the realtime session sends `response.create`, so it
closes the output-state gap between queued speech and `output-started`.

- [ ] **Step 4: Run focused verification**

```bash
yarn workspace @apps/petrinaut-website test:unit src/main/app/voice-interview/voice-turn-controller.test.ts
yarn workspace @apps/petrinaut-website lint:tsc
yarn workspace @apps/petrinaut-website lint:eslint
git diff --check
```

Expected: all commands exit with status 0.

- [ ] **Step 5: Commit, push, and resolve the new bot thread**

```bash
git add \
  apps/petrinaut-website/src/main/app/voice-interview/voice-turn-controller.ts \
  apps/petrinaut-website/src/main/app/voice-interview/voice-turn-controller.test.ts \
  docs/superpowers/plans/2026-09-06-voice-turn-settlement-reconciliation.md
git commit -m "Keep capture closed for queued Voice speech"
git push origin kostandin/fe-1580-harden-voice-safety-and-ux-on-the-unified-flue-route
gh api \
  --method POST \
  repos/hashintel/hash/pulls/9531/comments/3943758254/replies \
  -f body='Fixed. canonical-speech-requested now moves output to waiting-for-tool, so queued settlement speech keeps replay disabled and capture closed until playback settles.'
gh api graphql \
  -f threadId='PRRT_kwDOC75-is6frNee' \
  -f query='mutation($threadId:ID!){resolveReviewThread(input:{threadId:$threadId}){thread{isResolved}}}'
```
