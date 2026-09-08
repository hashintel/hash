/// <reference types="node" />
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, expect, test, vi } from "vitest";

import { runNodeScript } from "../../../../../brunch-agent/test/run-node-script";
import { selectCanonicalSpeech } from "./canonical-speech";
import { RealtimeBrunchBridge } from "./realtime-brunch-bridge";

import type { AdmissionVoiceEvidence } from "../../../../../brunch-agent/test/admission-voice-evidence";

const testDirectory = dirname(fileURLToPath(import.meta.url));
let result: AdmissionVoiceEvidence;
beforeAll(async () => {
  const { exitCode, stdout, stderr } = await runNodeScript(
    join(
      testDirectory,
      "../../../../../brunch-agent/test/admission-controls.integration.ts",
    ),
    join(testDirectory, "../../../../../.."),
    {},
  );
  if (exitCode !== 0) throw new Error(stderr || stdout);
  const line = stdout
    .split("\n")
    .find((entry) => entry.startsWith("ADMISSION_CONTROLS "));
  if (line === undefined) throw new Error(stdout);
  const parsed = JSON.parse(line.slice("ADMISSION_CONTROLS ".length)) as {
    voice: AdmissionVoiceEvidence;
  };
  result = parsed.voice;
});
const speechFrom = (messages: AdmissionVoiceEvidence["rejectedMessages"]) =>
  // The mounted runtime also emits core server tools absent from the editor's
  // static tool type. Retain every actual part in this controlled fixture: the
  // oracle must prove speech ignores payloads, not filter them away itself.
  selectCanonicalSpeech(
    messages as unknown as Parameters<typeof selectCanonicalSpeech>[0],
  );
const voice = () => {
  const speakCanonical = vi.fn();
  const bridge = new RealtimeBrunchBridge({
    session: { speakCanonical, subscribe: () => () => {} },
    submitInterviewAnswer: async () => {
      throw new Error(
        "This test exercises canonical output, not a microphone/provider.",
      );
    },
  });
  bridge.start(1);
  return { bridge, speakCanonical };
};

test("buffered production output remains silent until approved; marker and ordinary prose survive without speaking tool payloads", () => {
  const sample = result.buffering.find(
    ({ caseId }) => caseId === "buffered-valid",
  )!;
  const { bridge, speakCanonical } = voice();
  const pending = speechFrom(sample.projectedDuring);
  bridge.updateChat({
    canAcceptInterviewAnswer: false,
    canonicalSegments: pending.segments,
    status: "streaming",
  });
  expect(pending.segments).toEqual([]);
  expect(speakCanonical).not.toHaveBeenCalled();
  const completed = speechFrom(sample.projectedAfter);
  expect(completed.questionSegment?.text).toBe(result.question);
  expect(completed.segments.map((segment) => segment.text)).toEqual([
    sample.text,
    "Timing remains unknown.",
  ]);
  expect(
    completed.segments.some((segment) =>
      segment.text.includes(sample.privateMarkdown),
    ),
  ).toBe(false);
  bridge.updateChat({
    canAcceptInterviewAnswer: true,
    canonicalSegments: completed.segments,
    questionSegment: completed.questionSegment,
    status: "ready",
  });
  expect(speakCanonical).toHaveBeenCalledExactlyOnceWith(completed.segments);
  bridge.updateChat({
    canAcceptInterviewAnswer: true,
    canonicalSegments: completed.segments,
    questionSegment: completed.questionSegment,
    status: "ready",
  });
  expect(speakCanonical).toHaveBeenCalledOnce();
  bridge.stop();
});

test("rejected and durably cancelled proposals cannot authorize Voice output or question replay", () => {
  const stopped = result.buffering.find(
    ({ caseId }) => caseId === "buffered-cancelled",
  )!;
  for (const messages of [stopped.projectedAfter, result.rejectedMessages]) {
    const selection = speechFrom(messages);
    expect(selection.segments).toEqual([]);
    expect(selection.questionSegment).toBeUndefined();
    const { bridge, speakCanonical } = voice();
    bridge.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: selection.segments,
      status: "error",
    });
    expect(speakCanonical).not.toHaveBeenCalled();
    bridge.stop();
  }
});
