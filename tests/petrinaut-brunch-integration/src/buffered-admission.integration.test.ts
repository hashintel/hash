/// <reference types="node" />
import { beforeAll, expect, test, vi } from "vitest";

import {
  runAdmissionControls,
  type AdmissionControlsResult,
} from "@apps/brunch-agent/testing/admission-controls";
import { selectCanonicalSpeech } from "@apps/petrinaut-website/src/main/app/plugins/brunch/voice/live/canonical-speech";
import { RealtimeBrunchBridge } from "@apps/petrinaut-website/src/main/app/plugins/brunch/voice/realtime/realtime-brunch-bridge";

let result: AdmissionControlsResult;
beforeAll(async () => {
  ({ result } = await runAdmissionControls());
});
const speechFrom = (
  messages: AdmissionControlsResult["buffering"][number]["projectedAfter"],
) =>
  // The mounted runtime also emits core server tools absent from the editor's
  // static tool type. Retain every actual part in this controlled fixture: the
  // oracle must prove speech ignores payloads, not filter them away itself.
  selectCanonicalSpeech(
    messages as unknown as Parameters<typeof selectCanonicalSpeech>[0],
  );
const voice = () => {
  const speakCanonical =
    vi.fn<
      ConstructorParameters<
        typeof RealtimeBrunchBridge
      >[0]["session"]["speakCanonical"]
    >();
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

test("buffered production output remains silent until approved and derives the whole finalized turn", () => {
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
  expect(pending.segments.map((segment) => segment.text)).toEqual([
    sample.text,
  ]);
  expect(speakCanonical).not.toHaveBeenCalled();
  const completed = speechFrom(sample.projectedAfter);
  expect(completed.questionSegment?.text).toBe(
    `${sample.text}\n\nTiming remains unknown.`,
  );
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

test("durably cancelled proposals cannot authorize Voice output or question replay", () => {
  const stopped = result.buffering.find(
    ({ caseId }) => caseId === "buffered-cancelled",
  )!;
  const selection = speechFrom(stopped.projectedAfter);
  expect(selection.segments).toEqual([]);
  expect(selection.questionSegment).toBeUndefined();
});
