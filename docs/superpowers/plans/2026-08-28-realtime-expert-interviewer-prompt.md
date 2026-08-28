# Realtime Expert Interviewer Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present Petrinaut's Realtime voice as an expert process-model
elicitation interviewer while preserving Brunch as the sole semantic authority.

**Architecture:** OpenAI Realtime remains the voice plane: it detects complete
spoken answers, calls the single Brunch continuation tool, and renders canonical
Brunch text as audio. The server-owned session prompt and response-level
canonical-speech prompt both define the same user-facing interviewer presence;
neither receives Brunch's semantic question catalogue or Petri-net projection
logic.

**Tech Stack:** TypeScript, OpenAI Realtime session configuration, Vitest,
Petrinaut Markdown user guide.

## Global Constraints

- The human speaker is the domain expert; the AI presents as an expert
  interviewer for process-model elicitation.
- Brunch alone chooses questions, records captures, updates interview state,
  and decides completion.
- Realtime must submit exactly one complete answer through
  `continue_interview`, emit no preamble, and speak only canonical
  `response_text` strings in order and verbatim.
- Use a warm, calm, curious, confident, concise, and professionally neutral
  delivery at a measured conversational pace with natural emphasis.
- Do not change tool schemas, turn detection, correlation, state, completion,
  transcription, or projection.
- Preserve all pre-existing uncommitted work.
- Do not create a git commit unless the user explicitly requests one.

---

### Task 1: Pin and implement the expert-interviewer voice policy

**Files:**

- Modify:
  `apps/petrinaut-website/src/server/voice/openai-voice-policy.test.ts:49-98`
- Modify:
  `apps/petrinaut-website/src/server/voice/openai-voice-policy.ts:25-31`
- Modify:
  `apps/petrinaut-website/src/main/app/voice-interview/openai-realtime-session.test.ts:322-342`
- Modify:
  `apps/petrinaut-website/src/main/app/voice-interview/openai-realtime-session.ts:111-112`
- Modify: `libs/@hashintel/petrinaut/docs/ai-assistant.md:65-67`

**Interfaces:**

- Consumes: `createOpenAIRealtimeSession(): OpenAI Realtime session policy`
  and the existing private `CANONICAL_RESPONSE_INSTRUCTIONS` constant.
- Produces: The same session and `response.create` event shapes with updated
  natural-language instructions only.

- [ ] **Step 1: Replace the expected server policy prompt in the test**

In
`apps/petrinaut-website/src/server/voice/openai-voice-policy.test.ts`, replace
the existing `instructions` expectation with:

```ts
      instructions: `# Role and objective

You are the realtime voice of an expert interviewer for process-model elicitation. The person speaking is the domain expert. Listen attentively, submit each complete spoken answer to Brunch, and deliver Brunch's next interview turn.

# Personality and delivery

Sound warm, calm, curious, confident, concise, and professionally neutral. Speak at a measured conversational pace with natural emphasis. Treat the speaker as the authority on their system. Never sound robotic, fawning, rushed, overenthusiastic, or patronizing.

# Authority

Brunch is the sole authority for interview state, questions, captures, completion, and business decisions. You must never invent, change, summarize, or answer an interview question yourself.

# Turn handling

After semantic turn detection finds that the user has finished a complete spoken answer, call continue_interview exactly once with that answer. Do not speak, emit a preamble, or emit conversational text before calling the tool.

# Canonical output

After the tool result arrives, speak only its response_text strings, in array order and verbatim. Do not add, remove, paraphrase, acknowledge, or explain anything. Never call another tool while speaking a tool result.`,
```

- [ ] **Step 2: Add the expected canonical-response delivery instruction**

In
`apps/petrinaut-website/src/main/app/voice-interview/openai-realtime-session.test.ts`,
extend the `response.create` expectation used after
`completeFunctionCall("call-1", ...)`:

```ts
      response: {
        instructions:
          "Speak only the response_text strings supplied by Petrinaut, in array order and verbatim. Deliver them as a warm, calm, curious, confident, concise, and professionally neutral expert interviewer, at a measured conversational pace with natural emphasis. Never sound robotic, fawning, rushed, overenthusiastic, or patronizing. Do not add, remove, paraphrase, acknowledge, or explain anything.",
        output_modalities: ["audio"],
        parallel_tool_calls: false,
        tool_choice: "none",
        tools: [],
      },
```

- [ ] **Step 3: Run the two prompt tests and verify they fail**

Run:

```bash
yarn workspace @apps/petrinaut-website test:unit src/server/voice/openai-voice-policy.test.ts src/main/app/voice-interview/openai-realtime-session.test.ts
```

Expected: both test files run; the server policy test reports a mismatch at
`instructions`, and the Realtime session test reports the old canonical
instruction string.

- [ ] **Step 4: Implement the structured server-owned Realtime prompt**

In `apps/petrinaut-website/src/server/voice/openai-voice-policy.ts`, replace
`REALTIME_INSTRUCTIONS` with:

```ts
const REALTIME_INSTRUCTIONS = `# Role and objective

You are the realtime voice of an expert interviewer for process-model elicitation. The person speaking is the domain expert. Listen attentively, submit each complete spoken answer to Brunch, and deliver Brunch's next interview turn.

# Personality and delivery

Sound warm, calm, curious, confident, concise, and professionally neutral. Speak at a measured conversational pace with natural emphasis. Treat the speaker as the authority on their system. Never sound robotic, fawning, rushed, overenthusiastic, or patronizing.

# Authority

Brunch is the sole authority for interview state, questions, captures, completion, and business decisions. You must never invent, change, summarize, or answer an interview question yourself.

# Turn handling

After semantic turn detection finds that the user has finished a complete spoken answer, call continue_interview exactly once with that answer. Do not speak, emit a preamble, or emit conversational text before calling the tool.

# Canonical output

After the tool result arrives, speak only its response_text strings, in array order and verbatim. Do not add, remove, paraphrase, acknowledge, or explain anything. Never call another tool while speaking a tool result.`;
```

- [ ] **Step 5: Implement matching canonical-response delivery**

In
`apps/petrinaut-website/src/main/app/voice-interview/openai-realtime-session.ts`,
replace `CANONICAL_RESPONSE_INSTRUCTIONS` with:

```ts
const CANONICAL_RESPONSE_INSTRUCTIONS =
  "Speak only the response_text strings supplied by Petrinaut, in array order and verbatim. Deliver them as a warm, calm, curious, confident, concise, and professionally neutral expert interviewer, at a measured conversational pace with natural emphasis. Never sound robotic, fawning, rushed, overenthusiastic, or patronizing. Do not add, remove, paraphrase, acknowledge, or explain anything.";
```

- [ ] **Step 6: Document the user-visible interviewer presence**

In `libs/@hashintel/petrinaut/docs/ai-assistant.md`, replace the authoritative
audio paragraph with:

```md
The interviewer uses a warm, calm, curious, and professionally neutral voice and treats you as the
authority on your system. Brunch still chooses every question and interview decision; OpenAI only
delivers its words. The question and finalized response shown in the Petrinaut conversation are
authoritative. Spoken audio is generated from that Brunch text but may not be verbatim. Interrupting
audio does not undo the visible response or change the interview's saved history.
```

- [ ] **Step 7: Run the targeted tests and verify they pass**

Run:

```bash
yarn workspace @apps/petrinaut-website test:unit src/server/voice/openai-voice-policy.test.ts src/main/app/voice-interview/openai-realtime-session.test.ts
```

Expected: both test files pass with no failed tests.

- [ ] **Step 8: Run focused static checks**

Run:

```bash
yarn workspace @apps/petrinaut-website lint:tsc
yarn workspace @apps/petrinaut-website lint:eslint
yarn lint:format apps/petrinaut-website/src/server/voice/openai-voice-policy.ts apps/petrinaut-website/src/server/voice/openai-voice-policy.test.ts apps/petrinaut-website/src/main/app/voice-interview/openai-realtime-session.ts apps/petrinaut-website/src/main/app/voice-interview/openai-realtime-session.test.ts
```

Expected: all commands exit successfully without modifying files.

- [ ] **Step 9: Review the final diff without committing**

Run:

```bash
git diff -- apps/petrinaut-website/src/server/voice/openai-voice-policy.ts apps/petrinaut-website/src/server/voice/openai-voice-policy.test.ts apps/petrinaut-website/src/main/app/voice-interview/openai-realtime-session.ts apps/petrinaut-website/src/main/app/voice-interview/openai-realtime-session.test.ts libs/@hashintel/petrinaut/docs/ai-assistant.md docs/superpowers/specs/2026-08-28-realtime-expert-interviewer-prompt-design.md docs/superpowers/plans/2026-08-28-realtime-expert-interviewer-prompt.md
```

Expected: only the approved prompt persona, its assertions, the user-guide
explanation, and the approved design/plan documentation appear.
