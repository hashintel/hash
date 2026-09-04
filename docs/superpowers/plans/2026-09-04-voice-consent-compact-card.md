# Voice Consent Compact Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PR #9531's loose first-use Voice disclosure with the approved compact Petrinaut setup card without changing consent or session semantics.

**Architecture:** Keep the pre-session surface inside `VoiceInterviewControl`, where its behavior already lives. Restyle that surface with Petrinaut design-system primitives and add only local microphone-check pending state; the panel slot, persisted acknowledgement, and Voice controller remain unchanged.

**Tech Stack:** React 19, TypeScript, Panda CSS, `@hashintel/ds-components`, Vitest, Testing Library.

## Global Constraints

- Keep the surface pinned between the transcript and composer.
- Use the approved title, disclosure, checkbox, and button copy exactly.
- Use `Checkbox` and `Button` from `@hashintel/ds-components`.
- Preserve the versioned acknowledgement, focus behavior, and one-start flow.
- Keep the layout legible at the assistant's 320 px minimum width.
- Do not modify Voice transport, session, panel layout, or live Voice dock behavior.

---

## File structure

- Modify `apps/petrinaut-website/src/main/app/voice-interview/voice-interview-control.tsx`: render and style the compact disclosure card and guard the local microphone check while pending.
- Modify `apps/petrinaut-website/src/main/app/voice-interview/voice-interview-control.test.tsx`: pin the approved copy, accessible controls, pending microphone behavior, and unchanged acknowledgement semantics.

### Task 1: Build the compact Voice setup card

**Files:**

- Modify: `apps/petrinaut-website/src/main/app/voice-interview/voice-interview-control.tsx:10,207-306,405-407,535-558`
- Test: `apps/petrinaut-website/src/main/app/voice-interview/voice-interview-control.test.tsx:373-422,556-571`

**Interfaces:**

- Consumes: `Button` and `Checkbox` from `@hashintel/ds-components`; existing `consented`, `microphoneCheck`, `onCheckMicrophone`, `onConsentChange`, and `onStart` values.
- Produces: the existing `VoiceInterviewDisclosure` surface with one additional `checkingMicrophone: boolean` prop.

- [ ] **Step 1: Update the first-use disclosure test to pin the approved accessible UI**

Replace the old title and button assertions with:

```tsx
const disclosure = screen.getByRole("region", {
  name: "Voice mode consent",
});
expect(
  within(disclosure).getByText("Start a voice conversation"),
).not.toBeNull();
expect(
  within(disclosure).getByText(
    "OpenAI processes live audio and speaks the interviewer’s words. Petrinaut saves finalized answers—not audio.",
  ),
).not.toBeNull();

const consent = within(disclosure).getByRole("checkbox", {
  name: "I understand how voice data is handled.",
});
const start = within(disclosure).getByRole("button", {
  name: "Start voice",
});
expect(start.hasAttribute("disabled")).toBe(true);
fireEvent.click(consent);
expect(start.hasAttribute("disabled")).toBe(false);
expect(
  within(disclosure).getByRole("button", { name: "Test microphone" }),
).not.toBeNull();
expect(document.activeElement).toBe(disclosure);
```

Update the later acknowledgement test to query **Test microphone** and **Start voice**.

- [ ] **Step 2: Add a failing test for one pending microphone check**

Add a test with a controllable `getUserMedia` promise:

```tsx
test("keeps one microphone check pending and reports its result", async () => {
  let resolveCheck: ((stream: MediaStream) => void) | undefined;
  const getUserMedia = vi.fn(
    () =>
      new Promise<MediaStream>((resolve) => {
        resolveCheck = resolve;
      }),
  );
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  render(<VoiceInterviewHarness />);

  fireEvent.click(screen.getByRole("button", { name: "Select Voice" }));
  const check = screen.getByRole("button", { name: "Test microphone" });
  fireEvent.click(check);
  fireEvent.click(check);

  expect(getUserMedia).toHaveBeenCalledOnce();
  expect(check.getAttribute("aria-busy")).toBe("true");

  resolveCheck?.({ getTracks: () => [] } as unknown as MediaStream);

  expect(await screen.findByText("Microphone ready.")).not.toBeNull();
  await waitFor(() => expect(check.getAttribute("aria-busy")).toBe("false"));
});
```

- [ ] **Step 3: Run the focused test and verify the new assertions fail**

Run:

```bash
yarn workspace @apps/petrinaut-website test:unit src/main/app/voice-interview/voice-interview-control.test.tsx
```

Expected: the suite fails because the approved copy, button names, design-system checkbox, and pending-check guard are not implemented.

- [ ] **Step 4: Replace the native checkbox and loose disclosure markup**

Import the design-system checkbox:

```tsx
import { Button, Checkbox } from "@hashintel/ds-components";
```

Add a local decorative waveform matching Petrinaut's composer action:

```tsx
const VoiceModeIcon = () => (
  <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 20 20" width="16">
    <path
      d="M3 8.5v3M6.5 5.5v9M10 3v14M13.5 6v8M17 8.5v3"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.8"
    />
  </svg>
);
```

Replace the current disclosure styles with:

```tsx
const disclosureFrameStyle = css({
  width: "full",
  padding: "2",
  borderTopWidth: "thin",
  borderTopStyle: "solid",
  borderTopColor: "neutral.a20",
  backgroundColor: "neutral.bg.subtle",
  color: "neutral.s100",
  _focus: { outline: "none" },
});

const disclosureCardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "3",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  borderRadius: "xl",
  backgroundColor: "neutral.s00",
  boxShadow:
    "[0px 0px 0px 1px rgba(0,0,0,0.03), 0px 8px 16px -12px rgba(0,0,0,0.18)]",
});

const disclosureHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});

const disclosureIconStyle = css({
  display: "inline-flex",
  width: "7",
  height: "7",
  flexShrink: "0",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "lg",
  backgroundColor: "blue.a20",
  color: "blue.s90",
});

const disclosureTitleStyle = css({
  display: "flex",
  minWidth: "[0]",
  flexDirection: "column",
  gap: "0.5",
});

const disclosureHeadingStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  lineHeight: "tight",
});

const disclosureSubtitleStyle = css({
  color: "neutral.s80",
  fontSize: "xs",
});

const disclosureCopyStyle = css({
  color: "neutral.s90",
  fontSize: "xs",
  lineHeight: "relaxed",
});

const disclosureConsentStyle = css({
  width: "full",
  padding: "2",
  borderRadius: "lg",
  backgroundColor: "neutral.a10",
  color: "neutral.s100",
});

const disclosureActionsStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "2",
});

const disclosureStatusStyle = css({
  minHeight: "[18px]",
  color: "neutral.s80",
  fontSize: "xs",
  lineHeight: "relaxed",
});
```

Render the approved card:

```tsx
<section
  aria-label="Voice mode consent"
  className={disclosureFrameStyle}
  ref={disclosureRef}
  tabIndex={-1}
>
  <div className={disclosureCardStyle}>
    <div className={disclosureHeaderStyle}>
      <span className={disclosureIconStyle}>
        <VoiceModeIcon />
      </span>
      <div className={disclosureTitleStyle}>
        <strong className={disclosureHeadingStyle}>
          Start a voice conversation
        </strong>
        <span className={disclosureSubtitleStyle}>
          Talk through your process with AI
        </span>
      </div>
    </div>
    <p className={disclosureCopyStyle}>
      OpenAI processes live audio and speaks the interviewer’s words. Petrinaut
      saves finalized answers—not audio.
    </p>
    <Checkbox
      className={disclosureConsentStyle}
      label="I understand how voice data is handled."
      onChange={onConsentChange}
      size="xs"
      tone="brand"
      value={consented}
    />
    <div className={disclosureActionsStyle}>
      <Button
        disabled={!consented}
        onClick={onStart}
        size="xs"
        tone="brand"
        type="button"
      >
        Start voice
      </Button>
      <Button
        aria-describedby="voice-microphone-check-status"
        loading={checkingMicrophone}
        onClick={onCheckMicrophone}
        size="xs"
        type="button"
        variant="subtle"
      >
        Test microphone
      </Button>
    </div>
    <div
      aria-atomic="true"
      aria-live="polite"
      className={disclosureStatusStyle}
      id="voice-microphone-check-status"
    >
      {microphoneCheck}
    </div>
  </div>
</section>
```

- [ ] **Step 5: Guard the local microphone check while pending**

Add and pass the pending state:

```tsx
const [checkingMicrophone, setCheckingMicrophone] = useState(false);
```

```tsx
<VoiceInterviewDisclosure
  checkingMicrophone={checkingMicrophone}
  consented={consented}
  microphoneCheck={microphoneCheck}
  // existing callbacks
/>
```

Implement the guarded callback:

```tsx
onCheckMicrophone={() => {
  if (checkingMicrophone) {
    return;
  }
  setCheckingMicrophone(true);
  setMicrophoneCheck("");
  void navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then(
      (stream) => {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        setMicrophoneCheck("Microphone ready.");
      },
      () => setMicrophoneCheck("Microphone access was not available."),
    )
    .finally(() => setCheckingMicrophone(false));
}}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
yarn workspace @apps/petrinaut-website test:unit src/main/app/voice-interview/voice-interview-control.test.tsx
```

Expected: 15 tests pass with no failures.

- [ ] **Step 7: Run type checking and linting**

Run:

```bash
yarn workspace @apps/petrinaut-website lint:tsc
yarn workspace @apps/petrinaut-website lint:eslint
```

Expected: both commands exit 0. Existing non-failing warnings may remain unchanged.

- [ ] **Step 8: Inspect responsive layout**

Open the local Petrinaut preview and verify at 500 px and 320 px assistant widths:

- the card remains between transcript and composer;
- the title and copy wrap without horizontal overflow;
- actions remain ordered **Start voice**, then **Test microphone**;
- focus, disabled, loading, success, and failure states are legible;
- selecting **Start voice** transitions to the existing live Voice dock.

- [ ] **Step 9: Commit the implementation**

```bash
git add \
  apps/petrinaut-website/src/main/app/voice-interview/voice-interview-control.tsx \
  apps/petrinaut-website/src/main/app/voice-interview/voice-interview-control.test.tsx
git commit -m "Polish Voice consent setup"
```
