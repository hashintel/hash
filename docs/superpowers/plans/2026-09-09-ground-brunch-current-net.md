# Ground Brunch in the Current Petrinaut Net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every ordinary Brunch conversation a fresh, read-only view of the currently open Petrinaut net before answering a current-net request.

**Architecture:** Keep the existing mounted Flue conversation and browser client-tool continuation. Mount only `getLatestNetDefinition` globally in the SDCPN plugin, classify it in one shared browser client-tool catalog used by live transport and hydrated history, and require one read per net-referential user turn. Preserve all mutation-tool mode gates and the stock Petrinaut assistant.

**Tech Stack:** TypeScript, React 19, Flue runtime/SDK, AI SDK UI messages, Vitest, Vite, Graphite stacked branches.

## Global Constraints

- Implement FE-1653 as a child of PR #9619; do not cherry-pick PR #9523 or #9538.
- Treat #9523 as the behavior contract and #9538 commit `81ad66b2b5` as a portable implementation reference only.
- Do not add automatic scratch construction, a second conversation route, a snapshot cache, or direct Voice/OpenAI Realtime canvas context.
- Ordinary conversations receive `getLatestNetDefinition` but no mutation tools.
- Net snapshots return through the existing `client-tool-result` signal as machine evidence.
- Preserve prepared-fixture and validated-construction behavior.

---

### Task 1: Mount one tested read-only current-net capability

**Files:**

- Modify: `libs/@hashintel/brunch-agent/MISSION.md`
- Modify: `apps/brunch-agent/test/petrinaut-chat.test.ts`
- Modify: `apps/brunch-agent/test/petrinaut-chat.integration.ts`
- Modify: `libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/flue.ts`
- Modify: `apps/petrinaut-website/src/main/app/local-storage-demo/brunch-client-tools.ts`
- Modify: `apps/petrinaut-website/src/main/app/local-storage-demo/brunch-panel-transport.ts`
- Modify: `apps/petrinaut-website/src/main/app/local-storage-demo/use-flue-chat-history.ts`
- Modify: `apps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.test.tsx`
- Modify: `apps/petrinaut-website/src/main/app/local-storage-demo/use-flue-chat-history.test.ts`

**Interfaces:**

- Consumes: `petrinautConstructionTools`, `getLatestNetDefinitionToolName`, and `readPetrinautDocToolName`.
- Produces: one shared `brunchClientToolNames` catalog and an ordinary SDCPN plugin that exposes only the current-net read, covered at the server and browser projection boundaries.

- [ ] **Step 1: Replace the inherited child-branch mission**

Write a focused FE-1653 `MISSION.md` with the issue’s imperative, throughline, proof, constraints, fog-line, stop conditions, expected touched paths, and deferred automatic construction/provenance work. State that PR #9619 is the stack parent but Voice behavior is unchanged by this mission.

- [ ] **Step 2: Write failing server and browser contract tests**

Change the ordinary-conversation assertions to require the read tool while continuing to reject mutations:

```ts
expect(result.interviewerToolNames).toContain("getLatestNetDefinition");
for (const mutationToolName of [
  "addType",
  "addParameter",
  "addPlace",
  "addTransition",
  "addArc",
]) {
  expect(result.interviewerToolNames).not.toContain(mutationToolName);
}
```

In the faux-provider request inspection, require the grounding instruction and the `getLatestNetDefinition` tool definition before returning the existing response.

Require the shared ordinary browser catalog to contain exactly the docs reader and live-net reader:

```ts
expect([...brunchClientToolNames]).toEqual([
  "readPetrinautDoc",
  "getLatestNetDefinition",
]);
```

Add a hydrated-history case whose assistant message calls `getLatestNetDefinition` and whose correlated signal returns a small SIR definition. Call `useFlueChatHistory` without a custom catalog and assert the projected tool part is `output-available` with the returned snapshot.

- [ ] **Step 3: Run focused tests and verify red**

Run:

```bash
yarn workspace @apps/brunch-agent test:unit test/petrinaut-chat.test.ts
NODE_OPTIONS=--no-experimental-webstorage yarn workspace @apps/petrinaut-website test:unit src/main/app/local-storage-demo/local-storage-demo-app.test.tsx src/main/app/local-storage-demo/use-flue-chat-history.test.ts
```

Expected: failures showing `getLatestNetDefinition` is absent from the ordinary server and browser catalogs.

- [ ] **Step 4: Define the shared ordinary browser catalog**

In `brunch-client-tools.ts`, import `getLatestNetDefinitionToolName` and define:

```ts
export const brunchClientToolNames: ReadonlySet<string> = new Set([
  readPetrinautDocToolName,
  getLatestNetDefinitionToolName,
]);
```

- [ ] **Step 5: Reuse the shared catalog for live transport and hydration**

Delete private one-item catalogs from `brunch-panel-transport.ts` and `use-flue-chat-history.ts`. Import `brunchClientToolNames` from `./brunch-client-tools` and retain the existing optional fixture override.

- [ ] **Step 6: Mount the read tool globally without widening mutation access**

In `plugin-sdcpn/src/flue.ts`, import `getLatestNetDefinitionToolName`. Add a prompt-lifetime instruction equivalent to:

```ts
useInstruction(
  `
Before answering a user request about this model or the current, open, visible, or existing net—including explaining it, reviewing it, checking completeness, or beginning an interview—call \`${getLatestNetDefinitionToolName}\` once for that user turn unless its client-tool result is already present in the current continuation.
Use the returned live state as machine evidence. Do not say the canvas or net is unavailable while this tool is callable, and do not reuse a snapshot from an earlier user turn.
`.trim(),
);
```

Iterate over `petrinautConstructionTools` once. Mount `getLatestNetDefinition` in every mode, all tools in validated construction mode, and only the existing fixture subset after prepared-fixture initialization. Do not mount `addArc` or any other mutation in an ordinary conversation.

- [ ] **Step 7: Run focused tests and verify green**

Run the Step 3 commands. Expected: all focused contract and browser-catalog tests pass.

- [ ] **Step 8: Commit the coherent grounding seam**

Stage only the plan, mission, tests, plugin, and browser catalog files. Commit:

```bash
git commit -m "Ground Brunch in the current Petrinaut net"
```

### Task 2: Prove current-turn freshness and document the behavior

**Files:**

- Modify: `apps/brunch-agent/test/petrinaut-chat.integration.ts`
- Modify: `apps/brunch-agent/test/petrinaut-chat-result.ts` if the result contract needs grounding fields
- Modify: `libs/@hashintel/petrinaut/docs/ai-assistant.md`
- Create: `.changeset/<generated-grounding-name>.md` only if package rules require one

**Interfaces:**

- Consumes: the globally mounted live-net tool and existing correlated continuation.
- Produces: a deterministic fresh-snapshot proof and accurate user documentation.

- [ ] **Step 1: Add a deterministic current-net continuation**

Extend the production-path faux provider so a current-net request first emits:

```ts
fauxToolCall("getLatestNetDefinition", {}, { id: "tool-current-net-1" });
```

Return a browser client result containing an SIR title and named Susceptible/Infected/Recovered places, then emit model-specific prose. Assert the tool has no provider-executed marker, the original call id survives, and the visible user message appears once.

- [ ] **Step 2: Prove freshness**

Drive a second net-referential user turn with a changed snapshot and a second call id. Assert the second answer consumes the changed title or element and does not reuse the first snapshot. Keep this deterministic; do not call a paid provider.

- [ ] **Step 3: Document the behavior**

Update the Petrinaut AI assistant guide to say that Brunch reads the current net on demand for explain/review/interview requests and that typed and completed Voice input share this grounding path. Do not claim automatic construction or provenance.

- [ ] **Step 4: Run focused integration and documentation checks**

Run:

```bash
yarn workspace @apps/brunch-agent test:unit test/petrinaut-chat.test.ts
yarn workspace @hashintel/petrinaut test:unit
```

Expected: the deterministic two-turn grounding proof and Petrinaut documentation tests pass.

- [ ] **Step 5: Commit the proof**

Commit:

```bash
git commit -m "Prove fresh Petrinaut net grounding"
```

### Task 3: Verify and close the implementation record

**Files:**

- Modify: `libs/@hashintel/brunch-agent/MISSION.md`

**Interfaces:**

- Consumes: Tasks 1 and 2 as a complete FE-1653 implementation.
- Produces: exact verification evidence and a clean branch ready for controller-owned draft submission.

- [ ] **Step 1: Run package verification**

Run:

```bash
yarn workspace @apps/brunch-agent test:unit
NODE_OPTIONS=--no-experimental-webstorage yarn workspace @apps/petrinaut-website test:unit
yarn workspace @hashintel/petrinaut test:unit
yarn workspace @apps/brunch-agent lint:tsc
yarn workspace @apps/petrinaut-website lint:tsc
yarn workspace @hashintel/petrinaut lint:tsc
yarn workspace @apps/brunch-agent lint:eslint
yarn workspace @apps/petrinaut-website lint:eslint
yarn workspace @hashintel/petrinaut lint:eslint
turbo run build --filter @apps/brunch-agent --filter @apps/petrinaut-website --filter @hashintel/petrinaut
yarn workspace @local/petrinaut-arch-docs lint:arch-docs
yarn lint:format
git diff --check
```

Expected: all applicable tests, checks, and builds pass; only documented pre-existing warnings may remain.

- [ ] **Step 2: Perform the local browser witness when credentials are available**

Run `yarn dev:brunch`, open an ordinary non-empty SIR net, click **Explain this model**, and confirm the answer names visible SIR elements rather than asking for an attachment. Change one visible fact and ask again; confirm the next answer reflects the changed state. Exercise Voice only if provider credentials are available.

- [ ] **Step 3: Close the mission record and commit**

Record exact verification and witness scope in `MISSION.md`. Commit only FE-1653 files:

```bash
git commit -m "Record Petrinaut grounding verification"
```

- [ ] **Step 4: Hand controller the exact submission contract**

Report the final head SHA, verification evidence, browser-witness scope, and any unresolved warning. The controller will use Graphite because the documented `gh stack` extension is unavailable locally, create the draft child PR against `kostandin/fe-1604-recut-voice-interruption`, title it `FE-1653: Ground every Brunch conversation in the current Petrinaut net`, fill the repository PR template, and link FE-1653 plus PRs #9523, #9538, and #9619.
