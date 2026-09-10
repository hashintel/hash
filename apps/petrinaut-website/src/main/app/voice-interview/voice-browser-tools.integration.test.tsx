/** @vitest-environment jsdom */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import { Petrinaut } from "@hashintel/petrinaut/ui";

import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "../local-storage-demo/brunch-panel-transport";
import { selectCanonicalSpeech } from "./canonical-speech";
import { RealtimeBrunchBridge } from "./realtime-brunch-bridge";
import { submitVoiceInputWithAdmission } from "./voice-interview-control";

import type { OpenAIRealtimeSessionEvent } from "./openai-realtime-session";
import type { RealtimeBrunchBridgeEvent } from "./realtime-brunch-bridge";
import type { AgentSendResult, FlueClient } from "@flue/sdk";
import type { PetrinautAiVoiceModeContext } from "@hashintel/petrinaut/ui";

vi.hoisted(() => {
  document.queryCommandSupported = () => false;
  window.matchMedia = (media) => ({
    media,
    matches: false,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  });
});

const VoiceObserver = ({
  current,
  onUpdate,
}: {
  current: PetrinautAiVoiceModeContext;
  onUpdate: (context: PetrinautAiVoiceModeContext) => void;
}) => {
  useLayoutEffect(() => onUpdate(current), [current, onUpdate]);
  return null;
};
const inertWorker = () => ({
  postMessage() {},
  addEventListener() {},
  removeEventListener() {},
  terminate() {},
});
const hosts: Array<() => void> = [];
afterEach(() => {
  cleanup();
  for (const close of hosts.splice(0)) close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test.each([
  { preamble: true, outcome: "completed" },
  { preamble: false, outcome: "completed" },
  { preamble: false, outcome: "invalid-input" },
  { preamble: false, outcome: "withheld" },
  { preamble: true, outcome: "withheld" },
])(
  "settles the real panel/Voice browser-tool path ($outcome, preamble: $preamble)",
  async ({ preamble, outcome }) => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const tracker = new BrunchPanelConversationTracker();
    let context: PetrinautAiVoiceModeContext | undefined;
    let emitInput: ((event: OpenAIRealtimeSessionEvent) => void) | undefined;
    let finishContinuation: (() => void) | undefined;
    let finishStoppedStep: (() => void) | undefined;
    const events: RealtimeBrunchBridgeEvent[] = [];
    const speakParaphrase = vi.fn();
    const speakNotice = vi.fn();
    const send = vi.fn<FlueClient["send"]>(
      async (): Promise<AgentSendResult> => ({
        submissionId: `submission-${send.mock.calls.length}`,
        uid: "uid",
        offset: "0",
        streamUrl: "http://local.test/agents/chat/test/stream",
      }),
    );
    const wait = vi.fn<FlueClient["wait"]>(async (admission, options) => {
      const submissionId = (admission as AgentSendResult).submissionId;
      const continuation =
        Number(submissionId.replace("submission-", "")) % 2 === 0;
      if (submissionId === "submission-2")
        await new Promise<void>((resolve) => {
          finishContinuation = resolve;
        });
      if (!continuation && outcome === "withheld")
        await new Promise<void>((resolve) => {
          finishStoppedStep = resolve;
        });
      const messageId = continuation
        ? `continuation-${submissionId}`
        : `assistant-${submissionId}`;
      const batch = Number(submissionId.replace("submission-", ""));
      let ordinal = 0;
      const position = () => ({
        batch,
        index: ordinal++,
      });
      await options?.onEvent?.({
        type: "message-started",
        conversationId: "test",
        submissionId,
        messageId,
        turnId: messageId,
        position: position(),
      });
      if (preamble || continuation)
        await options?.onEvent?.({
          type: "message-delta",
          conversationId: "test",
          messageId,
          kind: "text",
          delta: continuation
            ? "The guide is available."
            : "Checking the guide.",
          position: position(),
        });
      if (!continuation)
        await options?.onEvent?.({
          type: "tool-input",
          conversationId: "test",
          messageId,
          toolCallId: `read-guide-${submissionId}`,
          toolName: "readPetrinautDoc",
          input: {
            doc: outcome === "invalid-input" ? "missing-page" : "ai-assistant",
          },
          position: position(),
        });
      await options?.onEvent?.({
        type: "message-completed",
        conversationId: "test",
        messageId,
        position: position(),
      });
      await options?.onEvent?.({
        type: "submission-settled",
        conversationId: "test",
        submissionId,
        outcome: "completed",
        position: position(),
      });
    });
    const client = { send, wait } as Pick<
      FlueClient,
      "send" | "wait"
    > as FlueClient;
    const bridge = new RealtimeBrunchBridge({
      session: {
        speakNotice,
        speakParaphrase,
        subscribe: (listener) => {
          emitInput = listener;
          return () => {};
        },
      },
      submitInterviewAnswer: async (input) => {
        if (!context) throw new Error("Panel did not mount");
        return submitVoiceInputWithAdmission({
          input,
          submitVoiceInput: context.submitVoiceInput,
          resolveInputSubmission: (messageId) =>
            tracker.submissionForInput(messageId),
          subscribeToAdmission: (target, listener) =>
            tracker.subscribeToAdmission(target, ({ admission }) =>
              listener(admission.submissionId),
            ),
          subscribeToAdmissionFailure: (target, listener) =>
            tracker.subscribeToAdmissionFailure(target, listener),
        });
      },
    });
    hosts.push(() => bridge.stop());
    bridge.subscribe((event) => events.push(event));
    tracker.subscribeToAdmissionEvents((event) =>
      bridge.notifyAdmission(event),
    );
    tracker.subscribeToSubmissionSettled((event) =>
      bridge.notifySubmissionSettled(event),
    );
    tracker.subscribeToResponseMessageCompleted((event) =>
      bridge.notifyResponseMessageCompleted(event),
    );
    tracker.subscribeToResponseMessageStarted((event) =>
      bridge.notifyResponseMessageStarted(event),
    );
    const updateVoice = (current: PetrinautAiVoiceModeContext) => {
      context = current;
      bridge.updateChat({
        canAcceptInterviewAnswer: current.canAcceptVoiceInput,
        status: current.status,
        stopped: current.stopped,
        canonicalSegments: selectCanonicalSpeech(current.messages).segments.map(
          (segment) => ({
            ...segment,
            submissionIds: tracker.submissionsForResponse(segment.messageId),
          }),
        ),
      });
    };
    const handle = createJsonDocHandle({
      id: "voice-browser-test",
      initial: {
        places: [],
        transitions: [],
        types: [],
        parameters: [],
        differentialEquations: [],
      },
    });
    render(
      <Petrinaut
        handle={handle}
        lspWorkerFactory={inertWorker}
        aiAssistant={{
          conversationId: "test",
          requestStop: async () => {
            tracker.recordStopRequested();
            bridge.cancelPendingSpeech();
            bridge.completeTurnHandoff();
            finishStoppedStep?.();
            return "already-settled";
          },
          transport: createBrunchPanelTransport(
            Promise.resolve(client),
            tracker,
          ),
          renderVoiceMode: (current) => (
            <VoiceObserver current={current} onUpdate={updateVoice} />
          ),
        }}
      />,
    );
    await waitFor(() => expect(context).toBeDefined());
    await act(async () => {
      bridge.start(1);
      emitInput?.({
        type: "completed",
        key: { connectionEpoch: 1, contentIndex: 0, itemId: "spoken-input" },
        text: "Read the guide.",
      });
    });
    if (outcome === "invalid-input") {
      await waitFor(() => expect(context?.status).toBe("error"));
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "submission-stopped",
          outcome: "failed",
        }),
      );
      expect(send).toHaveBeenCalledOnce();
      expect(speakParaphrase).not.toHaveBeenCalled();
      return;
    }
    if (outcome === "withheld") {
      await waitFor(() => expect(finishStoppedStep).toBeDefined());
      await act(async () => {
        await context?.stop();
      });
      await waitFor(() =>
        expect(events).toContainEqual(
          expect.objectContaining({
            type: "submission-stopped",
            outcome: "aborted",
          }),
        ),
      );
      // A later render must not resurrect prose committed after cancellation.
      if (context) updateVoice(context);
      expect(send).toHaveBeenCalledOnce();
      expect(speakParaphrase).not.toHaveBeenCalled();
      return;
    }
    await waitFor(() => expect(finishContinuation).toBeDefined());
    expect(send).toHaveBeenCalledTimes(2);
    expect(context?.status).not.toBe("ready");
    expect(
      events.some((event) => event.type === "canonical-response-ready"),
    ).toBe(false);
    expect(send.mock.calls[1]?.[0].message).toMatchObject({
      kind: "signal",
      context: { responseMode: "voice" },
      attributes: { toolCallIds: "read-guide-submission-1" },
    });
    const exercisesQueuedDrain = !preamble;
    if (exercisesQueuedDrain) {
      await act(async () => {
        emitInput?.({
          type: "completed",
          key: { connectionEpoch: 1, contentIndex: 0, itemId: "second" },
          text: "Second answer.",
        });
        emitInput?.({
          type: "completed",
          key: { connectionEpoch: 1, contentIndex: 0, itemId: "third" },
          text: "Third answer.",
        });
      });
      expect(send).toHaveBeenCalledTimes(2);
      expect(speakNotice).toHaveBeenCalledWith(
        "queued",
        "voice-realtime:1:second:0",
      );
      expect(speakNotice).toHaveBeenCalledWith(
        "queued",
        "voice-realtime:1:third:0",
      );
    }
    await act(async () => {
      finishContinuation?.();
    });
    await waitFor(() =>
      expect(events).toContainEqual(
        expect.objectContaining({ type: "canonical-response-ready" }),
      ),
    );
    if (exercisesQueuedDrain) {
      await waitFor(() => expect(send).toHaveBeenCalledTimes(6));
      await waitFor(() => expect(speakParaphrase).toHaveBeenCalledTimes(3));
      await waitFor(() => expect(context?.status).toBe("ready"));
      expect(speakParaphrase.mock.invocationCallOrder[0]).toBeLessThan(
        send.mock.invocationCallOrder[2]!,
      );
      expect(
        speakParaphrase.mock.calls.map(([, options]) => options.deliveryId),
      ).toEqual([
        "voice-realtime:1:spoken-input:0",
        "voice-realtime:1:second:0",
        "voice-realtime:1:third:0",
      ]);
    } else {
      expect(context?.status).toBe("ready");
      expect(
        speakParaphrase.mock.calls
          .flatMap(([segments]) => segments)
          .map((segment) => segment.text),
      ).toEqual(["Checking the guide.", "The guide is available."]);
    }
  },
);
