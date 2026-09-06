import { afterEach, describe, expect, test, vi } from "vitest";

import {
  OpenAIRealtimeSession,
  type OpenAIRealtimeSessionEvent,
} from "./openai-realtime-session";
import { RealtimeBrunchBridge } from "./realtime-brunch-bridge";
import { VoiceTurnController } from "./voice-turn-controller";

import type { CanonicalSpeechSegment } from "./canonical-speech";

class FakeDataChannel extends EventTarget {
  public readyState: RTCDataChannelState = "connecting";
  public readonly close = vi.fn(() => {
    this.readyState = "closed";
  });
  public readonly send = vi.fn();

  public open(): void {
    this.readyState = "open";
    this.dispatchEvent(new Event("open"));
  }

  public receive(payload: unknown): void {
    const event = new Event("message");
    Object.defineProperty(event, "data", {
      value: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
    this.dispatchEvent(event);
  }
}

const canonicalSegment = (
  id: string,
  text: string,
): CanonicalSpeechSegment => ({
  contentHash: "fnv1a32:12345678",
  id,
  messageId: `message-${id}`,
  partId: id,
  source: "assistant-text",
  text,
});

const createHarness = ({
  connectionTimeoutMs = 15_000,
}: {
  readonly connectionTimeoutMs?: number;
} = {}) => {
  let requestNumber = 0;
  const channels: FakeDataChannel[] = [];
  const localTracks: Array<{
    enabled: boolean;
    kind: string;
    stop: ReturnType<typeof vi.fn>;
  }> = [];
  const remoteAudios: Array<{
    autoplay: boolean;
    pause: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn>;
    srcObject: MediaStream | null;
  }> = [];
  const peers: Array<{
    addTrack: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    connectionState: RTCPeerConnectionState;
    createDataChannel: ReturnType<typeof vi.fn>;
    createOffer: ReturnType<typeof vi.fn>;
    onconnectionstatechange: (() => void) | null;
    ontrack: ((event: RTCTrackEvent) => void) | null;
    setLocalDescription: ReturnType<typeof vi.fn>;
    setRemoteDescription: ReturnType<typeof vi.fn<() => Promise<void>>>;
  }> = [];
  const getUserMedia = vi.fn(async () => {
    const track = { enabled: true, kind: "audio", stop: vi.fn() };
    localTracks.push(track);
    return {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
  });
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response("v=0\r\no=OpenAI answer", {
        headers: { "content-type": "application/sdp" },
      }),
  );
  const reportDiagnostic = vi.fn();
  const session = new OpenAIRealtimeSession({
    cancelAnimationFrame: vi.fn(),
    connectionTimeoutMs,
    createAudioContext: () =>
      ({
        close: vi.fn(async () => undefined),
        createAnalyser: vi.fn(() => ({
          fftSize: 0,
          getByteTimeDomainData: vi.fn((samples: Uint8Array) =>
            samples.fill(140),
          ),
        })),
        createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
        resume: vi.fn(async () => undefined),
        state: "running",
      }) as unknown as AudioContext,
    createPeerConnection: () => {
      const channel = new FakeDataChannel();
      channels.push(channel);
      const peer = {
        addTrack: vi.fn(),
        close: vi.fn(),
        connectionState: "new" as RTCPeerConnectionState,
        createDataChannel: vi.fn(() => channel),
        createOffer: vi.fn(async () => ({
          sdp: "v=0\r\no=browser offer",
          type: "offer" as RTCSdpType,
        })),
        onconnectionstatechange: null as (() => void) | null,
        ontrack: null as ((event: RTCTrackEvent) => void) | null,
        setLocalDescription: vi.fn(async () => undefined),
        setRemoteDescription: vi.fn(async () => channel.open()),
      };
      peers.push(peer);
      return peer as unknown as RTCPeerConnection;
    },
    createRemoteAudio: () => {
      const audio = {
        autoplay: false,
        pause: vi.fn(),
        play: vi.fn(async () => undefined),
        srcObject: null as MediaStream | null,
      };
      remoteAudios.push(audio);
      return audio;
    },
    createRequestId: () => `voice-request-${++requestNumber}`,
    fetch,
    getUserMedia,
    now: () => 100,
    reportDiagnostic,
    requestAnimationFrame: vi.fn(() => 1),
  });
  const events: OpenAIRealtimeSessionEvent[] = [];
  session.subscribe((event) => events.push(event));

  return {
    channels,
    events,
    fetch,
    getUserMedia,
    localTracks,
    peers,
    remoteAudios,
    reportDiagnostic,
    session,
  };
};

const sentEvents = (channel: FakeDataChannel): Record<string, unknown>[] =>
  channel.send.mock.calls.map(([payload]) => JSON.parse(payload as string));

const authorizeLatestSpeechResponse = (
  channel: FakeDataChannel,
  responseId: string,
): void => {
  const responseCreate = sentEvents(channel).findLast(
    ({ type }) => type === "response.create",
  )!;
  const response = responseCreate.response as Record<string, unknown>;
  channel.receive({
    type: "response.created",
    response: { id: responseId, metadata: response.metadata },
  });
};

describe("OpenAIRealtimeSession", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test.each([
    [
      "SDCPN, stochastic Petri net, place, transition, arc, token, marking, guard, rate, distribution, parameter, subnet, scenario, and metric.",
      "prompt-regurgitation",
    ],
    [
      "The supervisor reviews the request before the manager approves it.",
      "self-echo",
    ],
    ["stop", null],
    ["no", null],
    ["wait", null],
    ["The reviewer sends the signed form to the accounts department.", null],
    ["The applicant receives an email after the review is complete.", null],
    [
      "The auditor reviews all requests before the manager receives them.",
      null,
    ],
  ])(
    "cancels immediately and validates completed interruption through the real stack: %s",
    async (text, rejectionReason) => {
      const harness = createHarness();
      const submitInterviewAnswer = vi.fn<
        ConstructorParameters<
          typeof RealtimeBrunchBridge
        >[0]["submitInterviewAnswer"]
      >(async (input) => ({ kind: "message", messageId: input.id }));
      const reportDiagnostic = vi.fn();
      const bridge = new RealtimeBrunchBridge({
        session: harness.session,
        submitInterviewAnswer,
        reportDiagnostic,
      });
      const controller = new VoiceTurnController({
        bridge,
        session: harness.session,
        submitText: vi.fn(async () => undefined),
      });
      controller.setInterruptionBySpeaking(true);
      const history = canonicalSegment(
        "history",
        "The reviewer sends the signed form to the accounts department.",
      );
      controller.updateChat({
        canAcceptInterviewAnswer: true,
        canonicalSegments: [history],
        status: "ready",
      });
      await controller.start();
      const channel = harness.channels.at(-1)!;
      controller.updateChat({
        canAcceptInterviewAnswer: true,
        canonicalSegments: [
          history,
          canonicalSegment(
            "playing",
            "The supervisor reviews the request before the manager approves it.",
          ),
        ],
        status: "ready",
      });
      authorizeLatestSpeechResponse(channel, "playing-response");
      channel.receive({
        type: "output_audio_buffer.started",
        response_id: "playing-response",
      });
      harness.session.speakCanonical([
        canonicalSegment(
          "queued",
          "The applicant receives an email after the review is complete.",
        ),
      ]);
      channel.send.mockClear();
      channel.receive({
        type: "input_audio_buffer.speech_started",
        item_id: "interruption",
        audio_start_ms: 100,
      });
      expect(sentEvents(channel).map(({ type }) => type)).toEqual([
        "response.cancel",
        "output_audio_buffer.clear",
      ]);
      expect(submitInterviewAnswer).not.toHaveBeenCalled();
      expect(reportDiagnostic).not.toHaveBeenCalled();
      channel.receive({
        type: "conversation.item.input_audio_transcription.delta",
        item_id: "interruption",
        content_index: 0,
        delta: text,
      });
      expect(submitInterviewAnswer).not.toHaveBeenCalled();
      channel.receive({
        type: "response.done",
        response: { id: "playing-response", status: "cancelled", output: [] },
      });
      channel.receive({
        type: "output_audio_buffer.cleared",
        response_id: "playing-response",
      });
      const completed = {
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "interruption",
        content_index: 0,
        transcript: text,
      };
      channel.receive(completed);
      channel.receive(completed);
      if (rejectionReason) {
        expect(submitInterviewAnswer).not.toHaveBeenCalled();
        expect(controller.getSnapshot()).toMatchObject({
          connection: "connected",
          errorCode: null,
          inputNotice: "none",
          lastAnswerDelivery: "none",
          lastCommittedText: "",
          partialText: "",
        });
        expect(reportDiagnostic).toHaveBeenCalledOnce();
        expect(reportDiagnostic).toHaveBeenCalledWith({
          durationMs: expect.any(Number) as unknown,
          operation: "transcription",
          outcome: "rejected",
          rejectionReason,
          requestId: expect.any(String) as unknown,
          stage: "browser",
        });
        expect(JSON.stringify(reportDiagnostic.mock.calls)).not.toContain(text);
      } else {
        expect(submitInterviewAnswer).toHaveBeenCalledOnce();
        expect(submitInterviewAnswer).toHaveBeenCalledWith(
          expect.objectContaining({
            text,
            id: "voice-realtime:1:interruption:0",
          }),
        );
      }
      expect(
        sentEvents(channel).some(
          ({ type }) => type === "input_audio_buffer.clear",
        ),
      ).toBe(false);
      await controller.end();
    },
  );

  test.each(["playing", "generated", "creating"] as const)(
    "preserves an interrupting answer through the real Voice stack while %s",
    async (phase) => {
      const harness = createHarness();
      const submitInterviewAnswer = vi.fn<
        ConstructorParameters<
          typeof RealtimeBrunchBridge
        >[0]["submitInterviewAnswer"]
      >(async (input) => ({ kind: "message", messageId: input.id }));
      const bridge = new RealtimeBrunchBridge({
        session: harness.session,
        submitInterviewAnswer,
      });
      const controller = new VoiceTurnController({
        bridge,
        session: harness.session,
        submitText: vi.fn(async () => undefined),
      });
      controller.setInterruptionBySpeaking(true);
      await controller.start();
      const channel = harness.channels.at(-1)!;
      const question = canonicalSegment("question", "Who approves this?");
      controller.updateChat({
        canAcceptInterviewAnswer: true,
        canonicalSegments: [question],
        questionSegment: question,
        status: "ready",
      });
      if (phase !== "creating") {
        authorizeLatestSpeechResponse(channel, "question-response");
        channel.receive({
          type: "output_audio_buffer.started",
          response_id: "question-response",
        });
      }
      if (phase === "generated") {
        channel.receive({
          type: "response.done",
          response: {
            id: "question-response",
            status: "completed",
            output: [],
          },
        });
      }
      expect(harness.localTracks.at(-1)?.enabled).toBe(true);
      const pendingResponse = sentEvents(channel).findLast(
        ({ type }) => type === "response.create",
      )?.response as Record<string, unknown>;
      harness.session.speakCanonical([
        canonicalSegment("queued", "This must not play."),
      ]);
      channel.send.mockClear();
      channel.receive({
        type: "input_audio_buffer.speech_started",
        item_id: "interrupting-answer",
        audio_start_ms: 100,
      });
      if (phase !== "creating") {
        expect(sentEvents(channel).map(({ type }) => type)).toEqual([
          "response.cancel",
          "output_audio_buffer.clear",
        ]);
      }
      expect(harness.localTracks.at(-1)?.enabled).toBe(true);
      channel.receive({
        type: "conversation.item.input_audio_transcription.delta",
        item_id: "interrupting-answer",
        content_index: 0,
        delta: "The supervisor",
      });
      expect(controller.getSnapshot().partialText).toBe("The supervisor");
      if (phase === "creating") {
        channel.receive({
          type: "response.created",
          response: {
            id: "question-response",
            metadata: pendingResponse.metadata,
          },
        });
        expect(sentEvents(channel).map(({ type }) => type)).toEqual([
          "response.cancel",
          "output_audio_buffer.clear",
        ]);
      }
      const terminal = {
        type: "response.done",
        response: { id: "question-response", status: "cancelled", output: [] },
      };
      const cleared = {
        type: "output_audio_buffer.cleared",
        response_id: "question-response",
      };
      channel.receive(phase === "playing" ? terminal : cleared);
      channel.receive(phase === "playing" ? cleared : terminal);
      channel.receive({
        type: "output_audio_buffer.started",
        response_id: "question-response",
      });
      expect(controller.getSnapshot().connection).toBe("connected");
      expect(harness.localTracks.at(-1)?.enabled).toBe(true);
      expect(
        sentEvents(channel).some(({ type }) => type === "response.create"),
      ).toBe(false);
      channel.receive({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "interrupting-answer",
        content_index: 0,
        transcript: "The supervisor approves it.",
      });
      await vi.waitFor(() =>
        expect(submitInterviewAnswer).toHaveBeenCalledOnce(),
      );
      expect(submitInterviewAnswer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "voice-realtime:1:interrupting-answer:0",
          text: "The supervisor approves it.",
        }),
      );
      expect(
        sentEvents(channel).some(
          ({ type }) => type === "input_audio_buffer.clear",
        ),
      ).toBe(false);
      expect(controller.getSnapshot().lastCommittedText).toBe(
        "The supervisor approves it.",
      );
      await controller.end();
    },
  );

  test("reopens capture for a streamed reply and submits the retained interruption after settlement", async () => {
    const harness = createHarness();
    const submitInterviewAnswer = vi.fn<
      ConstructorParameters<
        typeof RealtimeBrunchBridge
      >[0]["submitInterviewAnswer"]
    >(async (input) => {
      input.onAdmission("submission-1");
      return {
        kind: "message",
        messageId: input.id,
        submissionId: "submission-1",
      };
    });
    const bridge = new RealtimeBrunchBridge({
      session: harness.session,
      submitInterviewAnswer,
    });
    const controller = new VoiceTurnController({
      bridge,
      session: harness.session,
      submitText: vi.fn(async () => undefined),
    });
    controller.setInterruptionBySpeaking(true);
    await controller.start();
    controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [],
      status: "ready",
    });
    const channel = harness.channels.at(-1)!;
    channel.receive({
      type: "input_audio_buffer.speech_started",
      item_id: "first-answer",
      audio_start_ms: 0,
    });
    channel.receive({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "first-answer",
      content_index: 0,
      transcript: "We need an approval.",
    });
    await vi.waitFor(() =>
      expect(controller.getSnapshot().lastAnswerDelivery).toBe("delivered"),
    );
    const reply = {
      ...canonicalSegment("reply", "Who approves this?"),
      submissionIds: ["submission-1"],
    };
    bridge.notifyResponseMessageCompleted({
      messageId: reply.messageId,
      submissionId: "submission-1",
      position: { batch: 1, index: 0 },
    });
    controller.updateChat({
      canAcceptInterviewAnswer: false,
      canonicalSegments: [reply],
      status: "streaming",
    });
    authorizeLatestSpeechResponse(channel, "streamed-reply");
    channel.receive({
      type: "output_audio_buffer.started",
      response_id: "streamed-reply",
    });
    expect(harness.localTracks.at(-1)?.enabled).toBe(true);
    controller.setMicrophoneMuted(true);
    expect(harness.localTracks.at(-1)?.enabled).toBe(false);
    controller.setMicrophoneMuted(false);
    expect(harness.localTracks.at(-1)?.enabled).toBe(true);
    channel.receive({
      type: "input_audio_buffer.speech_started",
      item_id: "second-answer",
      audio_start_ms: 100,
    });
    channel.receive({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "second-answer",
      content_index: 0,
      transcript: "The supervisor approves it.",
    });
    expect(submitInterviewAnswer).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().inputNotice).toBe("answer-pending");
    controller.updateChat({
      canAcceptInterviewAnswer: true,
      canonicalSegments: [reply],
      status: "ready",
    });
    await vi.waitFor(() =>
      expect(submitInterviewAnswer).toHaveBeenCalledTimes(2),
    );
    expect(submitInterviewAnswer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "voice-realtime:1:second-answer:0",
        text: "The supervisor approves it.",
      }),
    );
    await controller.end();
  });

  test("negotiates duplex WebRTC, attaches remote audio, and cleans all media", async () => {
    const harness = createHarness();

    await expect(harness.session.connect()).resolves.toBe(1);

    expect(harness.getUserMedia).toHaveBeenCalledWith({
      audio: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    expect(harness.localTracks[0]!.enabled).toBe(false);
    expect(harness.fetch).toHaveBeenCalledWith(
      "/api/voice/realtime-call",
      expect.objectContaining({
        body: "v=0\r\no=browser offer",
        method: "POST",
      }),
    );
    expect(JSON.stringify(harness.fetch.mock.calls)).not.toContain(
      "authorization",
    );

    const remoteTrack = { kind: "audio", stop: vi.fn() };
    const remoteStream = {
      getTracks: () => [remoteTrack],
    } as unknown as MediaStream;
    harness.peers[0]!.ontrack?.({
      streams: [remoteStream],
      track: remoteTrack,
    } as unknown as RTCTrackEvent);
    expect(harness.remoteAudios[0]).toMatchObject({
      autoplay: true,
      srcObject: remoteStream,
    });
    expect(harness.remoteAudios[0]!.play).toHaveBeenCalledOnce();

    await harness.session.disconnect();
    expect(harness.remoteAudios[0]!.pause).toHaveBeenCalledOnce();
    expect(harness.remoteAudios[0]!.srcObject).toBeNull();
    expect(remoteTrack.stop).toHaveBeenCalledOnce();
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
    expect(harness.peers[0]!.close).toHaveBeenCalledOnce();
  });

  test("keeps the microphone closed and rejects audio detected during playback", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);
    harness.session.speakCanonical([
      canonicalSegment("ask-1", "What happens next?"),
    ]);
    const channel = harness.channels[0]!;
    authorizeLatestSpeechResponse(channel, "response-canonical");

    channel.receive({
      event_id: "event-1",
      response_id: "response-canonical",
      type: "output_audio_buffer.started",
    });
    channel.receive({
      audio_start_ms: 120,
      event_id: "event-2",
      item_id: "item-user",
      type: "input_audio_buffer.speech_started",
    });
    channel.receive({
      response_id: "response-canonical",
      type: "output_audio_buffer.stopped",
    });
    channel.receive({
      content_index: 0,
      item_id: "item-user",
      transcript: "Assistant echo must not submit.",
      type: "conversation.item.input_audio_transcription.completed",
    });

    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ itemId: "item-user", type: "completed" }),
    );
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({
        itemId: "item-user",
        type: "input-speech-started",
      }),
    );
  });

  test("rejects an accepted input item whose transcript completes after output starts", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);
    const channel = harness.channels[0]!;

    channel.receive({
      audio_start_ms: 80,
      item_id: "item-before-output",
      type: "input_audio_buffer.speech_started",
    });
    channel.receive({
      content_index: 0,
      delta: "This started before output",
      item_id: "item-before-output",
      type: "conversation.item.input_audio_transcription.delta",
    });
    expect(harness.events).toContainEqual({
      key: {
        connectionEpoch: 1,
        contentIndex: 0,
        itemId: "item-before-output",
      },
      text: "This started before output",
      type: "partial",
    });

    harness.session.speakCanonical([
      canonicalSegment("ask-1", "What happens next?"),
    ]);
    authorizeLatestSpeechResponse(channel, "response-canonical");
    channel.receive({
      response_id: "response-canonical",
      type: "output_audio_buffer.started",
    });
    channel.receive({
      content_index: 0,
      item_id: "item-before-output",
      transcript: "This completed too late.",
      type: "conversation.item.input_audio_transcription.completed",
    });

    expect(
      harness.events.some(
        (event) =>
          event.type === "completed" &&
          event.key.itemId === "item-before-output",
      ),
    ).toBe(false);
    expect(harness.localTracks[0]!.enabled).toBe(false);
  });

  test("invalidates accepted input before requesting canonical speech output", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);
    const channel = harness.channels[0]!;
    let microphoneEnabledWhenResponseRequested: boolean | undefined;
    channel.send.mockImplementation((payload: string) => {
      if (JSON.parse(payload).type === "response.create") {
        microphoneEnabledWhenResponseRequested =
          harness.localTracks[0]!.enabled;
      }
    });

    channel.receive({
      audio_start_ms: 80,
      item_id: "item-before-request",
      type: "input_audio_buffer.speech_started",
    });
    channel.receive({
      content_index: 0,
      delta: "This started before canonical speech",
      item_id: "item-before-request",
      type: "conversation.item.input_audio_transcription.delta",
    });

    harness.session.speakCanonical([
      canonicalSegment("ask-request", "What happens next?"),
    ]);
    expect(harness.events).toContainEqual(
      expect.objectContaining({ type: "canonical-speech-requested" }),
    );
    expect(microphoneEnabledWhenResponseRequested).toBe(false);
    expect(harness.localTracks[0]!.enabled).toBe(false);

    channel.receive({
      content_index: 0,
      item_id: "item-before-request",
      transcript: "This completed before output started.",
      type: "conversation.item.input_audio_transcription.completed",
    });
    expect(
      harness.events.some(
        (event) =>
          event.type === "completed" &&
          event.key.itemId === "item-before-request",
      ),
    ).toBe(false);

    const handoff = harness.session.cancelOutput();
    let handoffSettled = false;
    void handoff.then(() => {
      handoffSettled = true;
    });
    authorizeLatestSpeechResponse(channel, "response-before-output");
    channel.receive({ type: "input_audio_buffer.cleared" });
    channel.receive({
      response: {
        id: "response-before-output",
        output: [],
        status: "cancelled",
      },
      type: "response.done",
    });
    await Promise.resolve();

    expect(handoffSettled).toBe(false);
    expect(harness.localTracks[0]!.enabled).toBe(false);

    channel.receive({
      response_id: "response-before-output",
      type: "output_audio_buffer.cleared",
    });
    await handoff;
    expect(harness.localTracks[0]!.enabled).toBe(true);

    channel.receive({
      content_index: 0,
      item_id: "item-before-request",
      transcript: "The stale item cannot recover authority.",
      type: "conversation.item.input_audio_transcription.completed",
    });
    channel.receive({
      audio_start_ms: 160,
      item_id: "item-after-handoff",
      type: "input_audio_buffer.speech_started",
    });
    channel.receive({
      content_index: 0,
      item_id: "item-after-handoff",
      transcript: "This is fresh after the handoff.",
      type: "conversation.item.input_audio_transcription.completed",
    });

    expect(
      harness.events.filter((event) => event.type === "completed"),
    ).toEqual([
      {
        key: {
          connectionEpoch: 1,
          contentIndex: 0,
          itemId: "item-after-handoff",
        },
        text: "This is fresh after the handoff.",
        type: "completed",
      },
    ]);
  });

  test("restores only the latest microphone preference after playback", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);
    harness.session.speakCanonical([
      canonicalSegment("ask-1", "What happens next?"),
    ]);
    const channel = harness.channels[0]!;
    authorizeLatestSpeechResponse(channel, "response-canonical");
    channel.receive({
      response_id: "response-canonical",
      type: "output_audio_buffer.started",
    });

    expect(harness.localTracks[0]!.enabled).toBe(false);
    harness.session.setMicrophoneEnabled(false);
    channel.receive({
      response_id: "response-canonical",
      type: "output_audio_buffer.stopped",
    });

    expect(harness.localTracks[0]!.enabled).toBe(false);
  });

  test("settles idle cancellation after input clear without response-scoped output", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);
    const channel = harness.channels[0]!;

    const cancellation = harness.session.cancelOutput();
    let settled = false;
    void cancellation.then(() => {
      settled = true;
    });
    channel.receive({ type: "input_audio_buffer.cleared" });
    await Promise.resolve();

    expect(settled).toBe(true);
    expect(harness.localTracks[0]!.enabled).toBe(true);
    expect(sentEvents(channel)).toEqual([
      { type: "input_audio_buffer.clear" },
      { type: "output_audio_buffer.clear" },
    ]);
  });

  test("waits for input, output, and response settlement before completing handoff", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);
    const channel = harness.channels[0]!;
    channel.receive({
      audio_start_ms: 40,
      item_id: "item-before-handoff",
      type: "input_audio_buffer.speech_started",
    });
    harness.session.speakCanonical([
      canonicalSegment("ask-handoff", "What happens next?"),
    ]);
    authorizeLatestSpeechResponse(channel, "response-handoff");
    channel.receive({
      response_id: "response-handoff",
      type: "output_audio_buffer.started",
    });

    const cancellation = Promise.resolve(harness.session.cancelOutput());
    let settled = false;
    void cancellation.then(() => {
      settled = true;
    });

    expect(harness.localTracks[0]!.enabled).toBe(false);
    expect(sentEvents(channel).slice(-3)).toEqual([
      { type: "input_audio_buffer.clear" },
      expect.objectContaining({
        response_id: "response-handoff",
        type: "response.cancel",
      }),
      { type: "output_audio_buffer.clear" },
    ]);
    channel.receive({
      content_index: 0,
      item_id: "item-before-handoff",
      transcript: "This began too early.",
      type: "conversation.item.input_audio_transcription.completed",
    });
    channel.receive({ type: "input_audio_buffer.cleared" });
    channel.receive({
      response_id: "response-handoff",
      type: "output_audio_buffer.cleared",
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(harness.localTracks[0]!.enabled).toBe(false);

    channel.receive({
      response: {
        id: "response-handoff",
        output: [],
        status: "cancelled",
      },
      type: "response.done",
    });
    await cancellation;

    expect(harness.localTracks[0]!.enabled).toBe(true);
    expect(
      harness.events.some(
        (event) =>
          event.type === "completed" &&
          event.key.itemId === "item-before-handoff",
      ),
    ).toBe(false);

    channel.receive({
      audio_start_ms: 120,
      item_id: "item-after-handoff",
      type: "input_audio_buffer.speech_started",
    });
    channel.receive({
      content_index: 0,
      item_id: "item-after-handoff",
      transcript: "This began after the handoff.",
      type: "conversation.item.input_audio_transcription.completed",
    });
    expect(harness.events).toContainEqual({
      key: {
        connectionEpoch: 1,
        contentIndex: 0,
        itemId: "item-after-handoff",
      },
      text: "This began after the handoff.",
      type: "completed",
    });
  });

  test("never exposes model function arguments as user input", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const channel = harness.channels[0]!;

    channel.receive({
      arguments: '{"answer":"Ignored"}',
      call_id: "call-ignored",
      item_id: "item-ignored",
      output_index: 0,
      response_id: "response-tool",
      type: "response.function_call_arguments.done",
    });
    channel.receive({
      call_id: "call-1",
      delta: '{"answer":"Approved"}',
      item_id: "item-function",
      output_index: 0,
      response_id: "response-tool",
      type: "response.function_call_arguments.delta",
    });
    expect(harness.events).toEqual([]);

    channel.receive({
      response: {
        id: "response-tool",
        output: [
          {
            arguments: '{"answer":"Approved"}',
            call_id: "call-1",
            id: "item-function",
            name: "continue_interview",
            type: "function_call",
          },
        ],
        status: "completed",
      },
      type: "response.done",
    });

    expect(harness.events).toEqual([
      expect.objectContaining({ code: "invalid-response", type: "error" }),
    ]);
  });

  test("preserves exact canonical whitespace while rejecting blank speech", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const channel = harness.channels[0]!;

    harness.session.speakCanonical([
      canonicalSegment("ask-exact", "  Exact Brunch text.\n"),
    ]);

    expect(sentEvents(channel)[0]).toMatchObject({
      type: "response.create",
      response: {
        conversation: "none",
        input: [
          {
            type: "message",
            role: "system",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  response_text: ["  Exact Brunch text.\n"],
                }),
              },
            ],
          },
        ],
        tool_choice: "none",
        tools: [],
      },
    });
    const sentCount = sentEvents(channel).length;
    expect(() =>
      harness.session.speakCanonical([canonicalSegment("ask-blank", " \n\t")]),
    ).toThrow();
    expect(sentEvents(channel)).toHaveLength(sentCount);
  });

  test("queues canonical speech behind an active Realtime response", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const channel = harness.channels[0]!;
    channel.receive({
      response: { id: "response-active" },
      type: "response.created",
    });

    harness.session.speakCanonical([
      canonicalSegment("question", "Canonical question"),
    ]);

    expect(sentEvents(channel)).toEqual([]);
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: "canonical-speech-requested" }),
    );
    channel.receive({
      response: {
        id: "response-active",
        output: [],
        status: "completed",
      },
      type: "response.done",
    });

    expect(sentEvents(channel)).toHaveLength(1);
    expect(sentEvents(channel)[0]).toMatchObject({
      type: "response.create",
      response: {
        metadata: { petrinaut_kind: "canonical-speech" },
      },
    });
    expect(harness.events).toContainEqual({
      connectionEpoch: 1,
      speechRequestId: "canonical-1-1",
      type: "canonical-speech-requested",
    });
    expect(harness.events).toContainEqual({
      connectionEpoch: 1,
      responseId: "response-active",
      status: "completed",
      type: "response-terminal",
    });
  });

  test("keeps the microphone closed when an earlier stop follows a queued response request", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);
    const channel = harness.channels[0]!;
    harness.session.speakCanonical([
      canonicalSegment("early", "First canonical segment."),
    ]);
    authorizeLatestSpeechResponse(channel, "response-early");
    channel.receive({
      response_id: "response-early",
      type: "output_audio_buffer.started",
    });
    harness.session.speakCanonical([
      canonicalSegment("follow-on", "Second canonical segment."),
    ]);

    channel.receive({
      response: {
        id: "response-early",
        output: [],
        status: "completed",
      },
      type: "response.done",
    });
    expect(harness.events.at(-1)).toMatchObject({
      speechRequestId: "canonical-1-2",
      type: "canonical-speech-requested",
    });
    authorizeLatestSpeechResponse(channel, "response-follow-on");
    channel.receive({
      response: {
        id: "response-follow-on",
        output: [],
        status: "completed",
      },
      type: "response.done",
    });

    channel.receive({
      response_id: "response-early",
      type: "output_audio_buffer.stopped",
    });

    expect(harness.localTracks[0]!.enabled).toBe(false);

    channel.receive({
      response_id: "response-follow-on",
      type: "output_audio_buffer.started",
    });
    channel.receive({
      response_id: "response-follow-on",
      type: "output_audio_buffer.stopped",
    });
    expect(harness.events).toContainEqual({
      connectionEpoch: 1,
      responseId: "response-follow-on",
      speechRequestId: "canonical-1-2",
      status: "completed",
      type: "response-terminal",
    });
    expect(harness.localTracks[0]!.enabled).toBe(true);
  });

  test("releases active canonical ownership after acknowledged cancellation", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);
    const channel = harness.channels[0]!;
    harness.session.speakCanonical([
      canonicalSegment("cancelled", "Cancel this canonical segment."),
    ]);
    authorizeLatestSpeechResponse(channel, "response-cancelled");

    const cancellation = harness.session.cancelOutput();
    let settled = false;
    void cancellation.then(() => {
      settled = true;
    });
    channel.receive({ type: "input_audio_buffer.cleared" });
    channel.receive({
      response: {
        id: "response-cancelled",
        output: [],
        status: "cancelled",
      },
      type: "response.done",
    });
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(harness.localTracks[0]!.enabled).toBe(false);

    channel.receive({
      response_id: "response-cancelled",
      type: "output_audio_buffer.cleared",
    });
    await cancellation;

    expect(harness.localTracks[0]!.enabled).toBe(true);
  });

  test("waits for output clear when cancelling generated audio before playback", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);
    const channel = harness.channels[0]!;
    harness.session.speakCanonical([
      canonicalSegment("generated", "Generated canonical segment."),
    ]);
    authorizeLatestSpeechResponse(channel, "response-generated");
    channel.receive({
      response: {
        id: "response-generated",
        output: [],
        status: "completed",
      },
      type: "response.done",
    });

    const cancellation = harness.session.cancelOutput();
    let settled = false;
    void cancellation.then(() => {
      settled = true;
    });
    channel.receive({ type: "input_audio_buffer.cleared" });
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(harness.localTracks[0]!.enabled).toBe(false);

    channel.receive({
      response_id: "response-generated",
      type: "output_audio_buffer.cleared",
    });
    await cancellation;

    expect(harness.localTracks[0]!.enabled).toBe(true);
  });

  test("force-settles cancellation when the provider fails before output clear", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);
    const cancellation = harness.session.cancelOutput();

    harness.channels[0]!.receive({
      error: { message: "private provider detail" },
      type: "error",
    });

    await expect(cancellation).resolves.toBeUndefined();
    expect(harness.localTracks[0]!.enabled).toBe(false);
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
    expect(harness.events.at(-1)).toMatchObject({
      code: "invalid-response",
      type: "error",
    });
  });

  test("cancels canonical speech before the response starts", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const channel = harness.channels[0]!;
    harness.session.speakCanonical([
      canonicalSegment("question", "Canonical question"),
    ]);
    const responseCreate = sentEvents(channel)[0]!;

    void harness.session.cancelOutput();

    expect(
      sentEvents(channel).filter(({ type }) => type === "response.cancel"),
    ).toEqual([]);

    channel.receive({
      response: {
        id: "response-canonical",
        metadata: (responseCreate.response as Record<string, unknown>).metadata,
      },
      type: "response.created",
    });

    expect(sentEvents(channel).slice(-2)).toEqual([
      expect.objectContaining({
        response_id: "response-canonical",
        type: "response.cancel",
      }),
      { type: "output_audio_buffer.clear" },
    ]);

    channel.receive({
      response_id: "response-canonical",
      type: "output_audio_buffer.started",
    });
    channel.receive({
      response: {
        id: "response-canonical",
        output: [],
        status: "cancelled",
      },
      type: "response.done",
    });

    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: "output-started" }),
    );
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: "error" }),
    );
    expect(harness.localTracks[0]!.stop).not.toHaveBeenCalled();
  });

  test("retries a correlated canonical response after the active response ends", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const channel = harness.channels[0]!;
    harness.session.speakCanonical([
      canonicalSegment("question", "Canonical question"),
    ]);
    const firstCreate = sentEvents(channel)[0]!;

    channel.receive({
      error: {
        code: "conversation_already_has_active_response",
        event_id: firstCreate.event_id,
        message: "private provider detail",
        type: "invalid_request_error",
      },
      type: "error",
    });
    channel.receive({
      response: { id: "response-active" },
      type: "response.created",
    });
    channel.receive({
      response: {
        id: "response-active",
        output: [],
        status: "completed",
      },
      type: "response.done",
    });

    const responseCreates = sentEvents(channel).filter(
      ({ type }) => type === "response.create",
    );
    expect(responseCreates).toHaveLength(2);
    expect(responseCreates[1]?.response).toEqual(firstCreate.response);
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: "error" }),
    );
    expect(harness.localTracks[0]!.stop).not.toHaveBeenCalled();
  });

  test("retries canonical speech when the active response ends before the correlated error arrives", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const channel = harness.channels[0]!;
    harness.session.speakCanonical([
      canonicalSegment("question", "Canonical question"),
    ]);
    const firstCreate = sentEvents(channel)[0]!;

    channel.receive({
      response: { id: "response-active" },
      type: "response.created",
    });
    channel.receive({
      response: {
        id: "response-active",
        output: [],
        status: "completed",
      },
      type: "response.done",
    });
    channel.receive({
      error: {
        code: "conversation_already_has_active_response",
        event_id: firstCreate.event_id,
        message: "private provider detail",
        type: "invalid_request_error",
      },
      type: "error",
    });

    const responseCreates = sentEvents(channel).filter(
      ({ type }) => type === "response.create",
    );
    expect(responseCreates).toHaveLength(2);
    expect(responseCreates[1]?.response).toEqual(firstCreate.response);
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: "error" }),
    );
  });

  test("ignores a correlated cancel for an already-finished response", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const channel = harness.channels[0]!;
    harness.session.speakCanonical([
      canonicalSegment("question", "Canonical question"),
    ]);
    const responseCreate = sentEvents(channel)[0]!;
    channel.receive({
      response: {
        id: "response-canonical",
        metadata: (responseCreate.response as Record<string, unknown>).metadata,
      },
      type: "response.created",
    });
    channel.receive({
      response_id: "response-canonical",
      type: "output_audio_buffer.started",
    });

    void harness.session.cancelOutput();
    const cancelEvent = sentEvents(channel).findLast(
      ({ type }) => type === "response.cancel",
    )!;
    expect(cancelEvent).toMatchObject({
      response_id: "response-canonical",
      type: "response.cancel",
    });
    channel.receive({
      error: {
        code: "response_cancel_not_active",
        event_id: cancelEvent.event_id,
        message: "private provider detail",
        type: "invalid_request_error",
      },
      type: "error",
    });

    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: "error" }),
    );
    expect(harness.localTracks[0]!.stop).not.toHaveBeenCalled();
  });

  test("ignores a late correlated cancel error after response completion", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const channel = harness.channels[0]!;
    harness.session.speakCanonical([
      canonicalSegment("question", "Canonical question"),
    ]);
    const responseCreate = sentEvents(channel)[0]!;
    channel.receive({
      response: {
        id: "response-canonical",
        metadata: (responseCreate.response as Record<string, unknown>).metadata,
      },
      type: "response.created",
    });
    channel.receive({
      response_id: "response-canonical",
      type: "output_audio_buffer.started",
    });

    void harness.session.cancelOutput();
    const cancelEvent = sentEvents(channel).findLast(
      ({ type }) => type === "response.cancel",
    )!;
    channel.receive({
      response: {
        id: "response-canonical",
        output: [],
        status: "cancelled",
      },
      type: "response.done",
    });
    channel.receive({
      error: {
        code: "response_cancel_not_active",
        event_id: cancelEvent.event_id,
        message: "private provider detail",
        type: "invalid_request_error",
      },
      type: "error",
    });

    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: "error" }),
    );
    expect(harness.localTracks[0]!.stop).not.toHaveBeenCalled();
  });

  test("rejects malformed completed function calls without exposing provider data", async () => {
    const harness = createHarness();
    await harness.session.connect();

    harness.channels[0]!.receive({
      response: {
        id: "response-tool",
        output: [
          {
            arguments: { private: "provider arguments" },
            call_id: "call-1",
            id: "item-function",
            name: "continue_interview",
            type: "function_call",
          },
        ],
        status: "completed",
      },
      type: "response.done",
    });

    expect(harness.events.at(-1)).toMatchObject({
      code: "invalid-response",
      type: "error",
    });
    expect(JSON.stringify(harness.events)).not.toContain("provider arguments");
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
  });

  test("rejects multiple function calls before emitting either one", async () => {
    const harness = createHarness();
    await harness.session.connect();

    harness.channels[0]!.receive({
      response: {
        id: "response-tool",
        output: ["call-1", "call-2"].map((callId) => ({
          arguments: '{"answer":"Approved"}',
          call_id: callId,
          id: `item-${callId}`,
          name: "continue_interview",
          status: "completed",
          type: "function_call",
        })),
        status: "completed",
      },
      type: "response.done",
    });

    expect(harness.events).toEqual([
      expect.objectContaining({ code: "invalid-response", type: "error" }),
    ]);
  });

  test("rejects a tool call from a canonical speech response", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.speakCanonical([
      canonicalSegment("question", "Canonical question"),
    ]);
    const responseCreate = sentEvents(harness.channels[0]!).at(-1)!;
    const response = responseCreate.response as Record<string, unknown>;

    harness.channels[0]!.receive({
      response: {
        id: "response-canonical",
        metadata: response.metadata,
      },
      type: "response.created",
    });
    harness.channels[0]!.receive({
      response: {
        id: "response-canonical",
        output: [
          {
            arguments: '{"answer":"Invented overlap"}',
            call_id: "call-not-allowed",
            id: "function-item-1",
            name: "continue_interview",
            type: "function_call",
          },
        ],
        status: "completed",
      },
      type: "response.done",
    });

    expect(harness.events.at(-1)).toMatchObject({
      code: "invalid-response",
      type: "error",
    });
    expect(harness.peers[0]!.close).toHaveBeenCalledOnce();
  });

  test("requires a matching speech-start boundary before exposing transcripts", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);
    const channel = harness.channels[0]!;

    channel.receive({
      content_index: 0,
      delta: "Missing boundary",
      item_id: "item-without-boundary",
      type: "conversation.item.input_audio_transcription.delta",
    });
    channel.receive({
      content_index: 0,
      item_id: "item-without-boundary",
      transcript: "This must stay rejected.",
      type: "conversation.item.input_audio_transcription.completed",
    });
    expect(harness.events).toEqual([]);

    channel.receive({
      audio_start_ms: 100,
      item_id: "item-user",
      type: "input_audio_buffer.speech_started",
    });
    channel.receive({
      content_index: 0,
      delta: "The supervisor",
      item_id: "item-user",
      type: "conversation.item.input_audio_transcription.delta",
    });
    channel.receive({
      content_index: 0,
      item_id: "item-user",
      transcript: "The supervisor approves it.",
      type: "conversation.item.input_audio_transcription.completed",
    });

    expect(harness.events).toEqual([
      {
        connectionEpoch: 1,
        itemId: "item-user",
        type: "input-speech-started",
      },
      {
        key: { connectionEpoch: 1, contentIndex: 0, itemId: "item-user" },
        text: "The supervisor",
        type: "partial",
      },
      {
        key: { connectionEpoch: 1, contentIndex: 0, itemId: "item-user" },
        text: "The supervisor approves it.",
        type: "completed",
      },
    ]);
    expect(harness.localTracks[0]!.enabled).toBe(true);
  });

  test("does not retroactively accept a completion that precedes its speech boundary", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);
    const channel = harness.channels[0]!;

    channel.receive({
      content_index: 0,
      item_id: "item-reordered",
      transcript: "This completed before its boundary.",
      type: "conversation.item.input_audio_transcription.completed",
    });
    channel.receive({
      audio_start_ms: 100,
      item_id: "item-reordered",
      type: "input_audio_buffer.speech_started",
    });

    expect(harness.events).toEqual([
      {
        connectionEpoch: 1,
        itemId: "item-reordered",
        type: "input-speech-started",
      },
    ]);
  });

  test("does not reuse a speech boundary from a previous connection epoch", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);
    harness.channels[0]!.receive({
      audio_start_ms: 100,
      item_id: "reused-item",
      type: "input_audio_buffer.speech_started",
    });

    await harness.session.disconnect();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);
    harness.events.length = 0;
    harness.channels[1]!.receive({
      content_index: 0,
      item_id: "reused-item",
      transcript: "This lacks a current-epoch boundary.",
      type: "conversation.item.input_audio_transcription.completed",
    });

    expect(harness.events).toEqual([]);
  });

  test("keeps the duplex session alive when optional input transcription fails", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);

    harness.channels[0]!.receive({
      audio_start_ms: 100,
      item_id: "item-user",
      type: "input_audio_buffer.speech_started",
    });
    harness.channels[0]!.receive({
      content_index: 0,
      error: { message: "private provider detail" },
      item_id: "item-user",
      type: "conversation.item.input_audio_transcription.failed",
    });

    expect(harness.events).toEqual([
      {
        connectionEpoch: 1,
        itemId: "item-user",
        type: "input-speech-started",
      },
      {
        key: { connectionEpoch: 1, contentIndex: 0, itemId: "item-user" },
        type: "transcription-failed",
      },
    ]);
    expect(harness.localTracks[0]!.enabled).toBe(true);
    expect(JSON.stringify(harness.events)).not.toContain(
      "private provider detail",
    );
  });

  test("fails closed if Realtime tries to play non-canonical audio", async () => {
    const harness = createHarness();
    await harness.session.connect();

    harness.channels[0]!.receive({
      event_id: "event-unauthorized",
      response_id: "response-unauthorized",
      type: "output_audio_buffer.started",
    });

    const [cancelEvent, clearEvent] = sentEvents(harness.channels[0]!);
    expect(cancelEvent).toMatchObject({
      response_id: "response-unauthorized",
      type: "response.cancel",
    });
    expect(typeof cancelEvent?.event_id).toBe("string");
    expect(clearEvent).toEqual({ type: "output_audio_buffer.clear" });
    expect(harness.events.at(-1)).toMatchObject({
      code: "invalid-response",
      type: "error",
    });
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
  });

  test("rejects stale events and cleans the first epoch during reconnect", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const firstChannel = harness.channels[0]!;

    await expect(harness.session.connect()).resolves.toBe(2);
    firstChannel.receive({
      arguments: '{"answer":"Stale"}',
      call_id: "call-stale",
      item_id: "item-stale",
      name: "continue_interview",
      output_index: 0,
      response_id: "response-stale",
      type: "response.function_call_arguments.done",
    });

    expect(harness.events).toEqual([]);
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
    expect(harness.peers[0]!.close).toHaveBeenCalledOnce();
  });

  test("sanitizes provider errors and releases media", async () => {
    const harness = createHarness();
    await harness.session.connect();

    harness.channels[0]!.receive({
      error: { message: "private provider body" },
      type: "error",
    });

    expect(harness.events.at(-1)).toMatchObject({
      code: "invalid-response",
      type: "error",
    });
    expect(JSON.stringify(harness.events)).not.toContain(
      "private provider body",
    );
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
  });

  test("classifies microphone permission and network failures", async () => {
    const permissionFailure = createHarness();
    permissionFailure.getUserMedia.mockRejectedValueOnce(
      new DOMException("private browser detail", "NotAllowedError"),
    );

    await expect(permissionFailure.session.connect()).rejects.toMatchObject({
      code: "microphone-permission",
      requestId: "voice-request-1",
    });
    expect(
      JSON.stringify(permissionFailure.reportDiagnostic.mock.calls),
    ).not.toContain("private browser detail");

    const networkFailure = createHarness();
    networkFailure.fetch.mockRejectedValueOnce(
      new Error("private network detail"),
    );

    await expect(networkFailure.session.connect()).rejects.toMatchObject({
      code: "network",
      requestId: "voice-request-1",
    });
    expect(networkFailure.localTracks[0]!.stop).toHaveBeenCalledOnce();
    expect(
      JSON.stringify(networkFailure.reportDiagnostic.mock.calls),
    ).not.toContain("private network detail");

    const bodyFailure = createHarness();
    bodyFailure.fetch.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("private response stream detail"));
          },
        }),
        { headers: { "content-type": "application/sdp" } },
      ),
    );

    await expect(bodyFailure.session.connect()).rejects.toMatchObject({
      code: "network",
      requestId: "voice-request-1",
    });
    expect(
      JSON.stringify(bodyFailure.reportDiagnostic.mock.calls),
    ).not.toContain("private response stream detail");
  });

  test("classifies a data channel that closes during startup as a network failure", async () => {
    const harness = createHarness();
    let resolveFetch: ((response: Response) => void) | undefined;
    harness.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const connection = harness.session.connect();
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledOnce());
    harness.peers[0]!.setRemoteDescription.mockResolvedValueOnce(undefined);
    resolveFetch?.(
      new Response("v=0\r\no=OpenAI answer", {
        headers: { "content-type": "application/sdp" },
      }),
    );
    await vi.waitFor(() =>
      expect(harness.peers[0]!.setRemoteDescription).toHaveBeenCalledOnce(),
    );

    harness.channels[0]!.dispatchEvent(new Event("close"));

    await expect(connection).rejects.toMatchObject({
      code: "network",
      requestId: "voice-request-1",
    });
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
    expect(harness.peers[0]!.close).toHaveBeenCalledOnce();
  });

  test("rejects a provider error received before startup completes", async () => {
    const harness = createHarness();
    let resolveFetch: ((response: Response) => void) | undefined;
    harness.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const connection = expect(harness.session.connect()).rejects.toMatchObject({
      code: "invalid-response",
      requestId: "voice-request-1",
    });
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledOnce());
    harness.peers[0]!.setRemoteDescription.mockImplementationOnce(async () => {
      harness.channels[0]!.open();
      harness.channels[0]!.receive({
        type: "error",
        error: { message: "private provider diagnostic" },
      });
    });
    resolveFetch?.(
      new Response("v=0\r\no=OpenAI answer", {
        headers: { "content-type": "application/sdp" },
      }),
    );

    await connection;
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
    expect(JSON.stringify(harness.reportDiagnostic.mock.calls)).not.toContain(
      "private provider diagnostic",
    );
  });

  test("preserves a peer failure while the realtime call is pending", async () => {
    const harness = createHarness();
    harness.fetch.mockImplementationOnce(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const connection = harness.session.connect();
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledOnce());

    harness.peers[0]!.connectionState = "failed";
    harness.peers[0]!.onconnectionstatechange?.();

    await expect(connection).rejects.toMatchObject({
      code: "network",
      requestId: "voice-request-1",
    });
    expect(harness.reportDiagnostic).toHaveBeenLastCalledWith(
      expect.objectContaining({
        errorCode: "network",
        outcome: "failure",
      }),
    );
  });

  test("preserves a provider failure while waiting for the data channel", async () => {
    const harness = createHarness();
    let resolveFetch: ((response: Response) => void) | undefined;
    harness.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const connection = harness.session.connect();
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledOnce());
    harness.peers[0]!.setRemoteDescription.mockResolvedValueOnce(undefined);
    resolveFetch?.(
      new Response("v=0\r\no=OpenAI answer", {
        headers: { "content-type": "application/sdp" },
      }),
    );
    await vi.waitFor(() =>
      expect(harness.peers[0]!.setRemoteDescription).toHaveBeenCalledOnce(),
    );
    await Promise.resolve();

    harness.channels[0]!.receive({
      error: { message: "private provider diagnostic" },
      type: "error",
    });

    await expect(connection).rejects.toMatchObject({
      code: "invalid-response",
      requestId: "voice-request-1",
    });
    expect(harness.reportDiagnostic).toHaveBeenLastCalledWith(
      expect.objectContaining({
        errorCode: "invalid-response",
        outcome: "failure",
      }),
    );
  });

  test("rejects a data channel already closed after negotiation", async () => {
    const harness = createHarness({ connectionTimeoutMs: 1_000 });
    let resolveFetch: ((response: Response) => void) | undefined;
    harness.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const connection = expect(harness.session.connect()).rejects.toMatchObject({
      code: "network",
      requestId: "voice-request-1",
    });
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledOnce());
    harness.peers[0]!.setRemoteDescription.mockImplementationOnce(async () => {
      harness.channels[0]!.close();
    });
    resolveFetch?.(
      new Response("v=0\r\no=OpenAI answer", {
        headers: { "content-type": "application/sdp" },
      }),
    );

    await connection;
  });

  test("sanitizes invalid SDP and browser application failures", async () => {
    const invalidAnswer = createHarness();
    invalidAnswer.fetch.mockResolvedValueOnce(
      new Response("private invalid answer", {
        headers: { "content-type": "application/sdp" },
      }),
    );

    await expect(invalidAnswer.session.connect()).rejects.toMatchObject({
      code: "invalid-response",
      requestId: "voice-request-1",
    });
    expect(
      JSON.stringify(invalidAnswer.reportDiagnostic.mock.calls),
    ).not.toContain("private invalid answer");

    const applicationFailure = createHarness();
    let resolveFetch: ((response: Response) => void) | undefined;
    applicationFailure.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const connection = applicationFailure.session.connect();
    await vi.waitFor(() =>
      expect(applicationFailure.fetch).toHaveBeenCalledOnce(),
    );
    applicationFailure.peers[0]!.setRemoteDescription.mockRejectedValueOnce(
      new Error("private SDP application failure"),
    );
    resolveFetch?.(
      new Response("v=0\r\no=OpenAI answer", {
        headers: { "content-type": "application/sdp" },
      }),
    );

    await expect(connection).rejects.toMatchObject({
      code: "invalid-response",
      requestId: "voice-request-1",
    });
    expect(
      JSON.stringify(applicationFailure.reportDiagnostic.mock.calls),
    ).not.toContain("private SDP application failure");
  });

  test("classifies explicit disconnect during startup as aborted", async () => {
    const harness = createHarness();
    harness.fetch.mockImplementationOnce(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("private abort detail", "AbortError")),
          );
        }),
    );
    const connection = harness.session
      .connect()
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledOnce());

    await harness.session.disconnect();

    await expect(connection).resolves.toMatchObject({
      code: "request-aborted",
      requestId: "voice-request-1",
    });
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
    expect(JSON.stringify(harness.reportDiagnostic.mock.calls)).not.toContain(
      "private abort detail",
    );
  });

  test("closes all media when the peer connection fails", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);

    harness.peers[0]!.connectionState = "failed";
    harness.peers[0]!.onconnectionstatechange?.();

    expect(harness.events.at(-1)).toMatchObject({
      code: "network",
      type: "error",
    });
    expect(harness.localTracks[0]!.enabled).toBe(false);
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
    expect(harness.channels[0]!.close).toHaveBeenCalledOnce();
    expect(harness.peers[0]!.close).toHaveBeenCalledOnce();
  });

  test("times out a stalled microphone permission prompt and stops late media", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const lateTrack = { enabled: true, kind: "audio", stop: vi.fn() };
    const lateStream = {
      getAudioTracks: () => [lateTrack],
      getTracks: () => [lateTrack],
    } as unknown as MediaStream;
    let resolveMedia: ((stream: MediaStream) => void) | undefined;
    harness.getUserMedia.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMedia = resolve;
        }),
    );

    const connection = harness.session
      .connect()
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);
    resolveMedia?.(lateStream);

    await expect(connection).resolves.toMatchObject({
      code: "timeout",
      requestId: "voice-request-1",
    });
    expect(lateTrack.stop).toHaveBeenCalledOnce();
  });
});
