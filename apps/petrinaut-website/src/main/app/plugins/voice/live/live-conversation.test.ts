// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { VoiceAudioSettings } from "../session/voice-audio-settings";
import { createLiveConversation } from "./live-conversation";
import { createOutputEchoTrace } from "./live-conversation/echo-diagnostics";
import { createUtteranceLevels } from "./live-conversation/utterance-levels";

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

const traceRecords = (calls: readonly (readonly unknown[])[], event: string) =>
  calls
    .map(
      ([line]) =>
        JSON.parse(
          String(line).replace("[Petrinaut Live trace] ", ""),
        ) as Record<string, unknown>,
    )
    .filter((record) => record.event === event);

test("does not carry an output transcript span into the next audible stretch", () => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const echoTrace = createOutputEchoTrace("session");
  const sample = (at: number, audible: boolean) =>
    echoTrace.sample(at, {
      audible,
      microphoneLevel: 0,
      echoReturnLoss: undefined,
      echoReturnLossEnhancement: undefined,
      microphoneMuted: false,
      selectedSpeaker: false,
    });

  sample(0, true);
  echoTrace.liveOutputFragment(5_000, 5_400);
  sample(1_000, false);

  sample(2_000, true);
  echoTrace.liveInputFragment(7_000);
  sample(3_000, false);

  expect(traceRecords(debug.mock.calls, "echo.output")).toEqual([
    expect.objectContaining({ liveInputFragments: 0 }),
    expect.objectContaining({ liveInputFragments: 0 }),
  ]);
});

test("audible output a full tail after the last starts a new output stretch", () => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const echoTrace = createOutputEchoTrace("session");
  const sample = (at: number) =>
    echoTrace.sample(at, {
      audible: true,
      microphoneLevel: 0,
      echoReturnLoss: undefined,
      echoReturnLossEnhancement: undefined,
      microphoneMuted: false,
      selectedSpeaker: false,
    });

  sample(0);
  sample(999);
  sample(1_999);
  echoTrace.end();

  expect(traceRecords(debug.mock.calls, "echo.output")).toEqual([
    expect.objectContaining({ sessionEnded: false, outputMs: 999 }),
    expect.objectContaining({ sessionEnded: true, outputMs: 0 }),
  ]);
});

test("counts speech as started during output only when its start is reported within half a second", () => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const echoTrace = createOutputEchoTrace("session");
  const sample = (at: number, audible: boolean) =>
    echoTrace.sample(at, {
      audible,
      microphoneLevel: 0,
      echoReturnLoss: undefined,
      echoReturnLossEnhancement: undefined,
      microphoneMuted: false,
      selectedSpeaker: false,
    });

  sample(0, true);
  echoTrace.transcriptionSpeechStarted("during", 50);
  sample(100, false);
  echoTrace.transcriptionSpeechStarted("inside", 499);
  echoTrace.transcriptionSpeechStarted("outside", 500);
  sample(1_000, false);
  echoTrace.transcriptionSpeechStarted("quiet", 1_100);

  const itemIds = ["during", "inside", "outside", "quiet"];
  expect(
    itemIds.map((itemId) => echoTrace.startedDuringOutput(itemId)),
  ).toEqual([true, true, false, false]);
  expect(itemIds.map((itemId) => echoTrace.sinceOutputMs(itemId))).toEqual([
    50,
    499,
    500,
    undefined,
  ]);
  echoTrace.forget("during");
  expect(echoTrace.sinceOutputMs("during")).toBeUndefined();
  expect(traceRecords(debug.mock.calls, "echo.output")).toEqual([
    expect.objectContaining({ transcriptionSpeechStarts: 3 }),
  ]);
});

test("records each utterance's peak microphone level from the second before its reported start until it stops", () => {
  const levels = createUtteranceLevels();

  levels.sample(0, 0.9);
  levels.sample(600, 0.5);
  levels.speechStarted("yes", 1_500);
  levels.sample(1_600, 0.2);
  levels.speechStopped("yes");
  levels.sample(1_700, 0.95);
  levels.speechStarted("noise", 3_000);
  levels.sample(3_100, 0.123);

  expect(levels.peak("yes")).toBe(0.5);
  expect(levels.peak("noise")).toBe(0.12);
  expect(levels.peak("unheard")).toBeUndefined();
  levels.forget("yes");
  expect(levels.peak("yes")).toBeUndefined();
});

const setup = ({
  audioSettings,
  audioMuted = false,
  audioVolume = 1,
  inputEnabled = true,
  readWords,
}: {
  readonly audioSettings?: VoiceAudioSettings;
  readonly audioMuted?: boolean;
  readonly audioVolume?: number;
  readonly inputEnabled?: boolean;
  readonly readWords?: Parameters<typeof createLiveConversation>[7];
} = {}) => {
  const sent = [[], []] as [string[], string[]];
  const createChannel = (events: string[]) =>
    Object.assign(new EventTarget(), {
      readyState: "open",
      send: (data: string) => events.push(data),
      close: vi.fn(),
    });
  const channels = [createChannel(sent[0]), createChannel(sent[1])] as const;
  const input = Object.assign(new EventTarget(), {
    kind: "audio",
    enabled: inputEnabled,
    stop: vi.fn(),
  });
  const outputs = [{ stop: vi.fn() }, { stop: vi.fn() }];
  const stream = {
    getAudioTracks: () => [input],
    getTracks: () => [input],
  };
  const peers = channels.map((channel, index) =>
    Object.assign(new EventTarget(), {
      connectionState: "new",
      iceGatheringState: "complete",
      localDescription: { type: "offer", sdp: `v=0\r\no=offer-${index}` },
      createDataChannel: vi.fn(() => channel),
      addTrack: vi.fn(),
      createOffer: vi.fn(async () => ({ type: "offer", sdp: "v=0" })),
      setLocalDescription: vi.fn(async () => undefined),
      setRemoteDescription: vi.fn(async () => undefined),
      close: vi.fn(),
      getSenders: () => [{ track: input, replaceTrack: vi.fn() }],
      getReceivers: () => [{ track: outputs[index]! }],
      getStats: vi.fn(async () => new Map()),
    }),
  );
  let peerIndex = 0;
  const RTCPeerConnectionMock = vi.fn(function createPeer(this: unknown) {
    return peers[peerIndex++]!;
  });
  vi.stubGlobal("RTCPeerConnection", RTCPeerConnectionMock);
  const audio = {
    autoplay: false,
    srcObject: null,
    muted: audioMuted,
    paused: false,
    volume: audioVolume,
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
  };
  vi.stubGlobal(
    "Audio",
    class {
      constructor() {
        return audio;
      }
    },
  );
  const getUserMedia = vi.fn(async () => stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.endsWith("transcription-session")
        ? { sdp: "v=0\r\no=transcription-answer" }
        : { sessionId: "opaque", sdp: "v=0\r\no=live-answer" },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const onState = vi.fn<Parameters<typeof createLiveConversation>[0]>();
  const onFinalizedInput =
    vi.fn<Parameters<typeof createLiveConversation>[2]>();
  const onDelegation = vi.fn<Parameters<typeof createLiveConversation>[3]>();
  const onAppendResult = vi.fn<Parameters<typeof createLiveConversation>[4]>();
  const speech = {
    started: vi.fn(),
    input: vi.fn(),
    output: vi.fn(),
    closed: vi.fn(),
  };
  const conversation = createLiveConversation(
    onState,
    15_000,
    onFinalizedInput,
    onDelegation,
    onAppendResult,
    audioSettings,
    speech,
    readWords,
  );
  const emit = (connection: 0 | 1, data: unknown) =>
    channels[connection].dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(data) }),
    );
  return {
    conversation,
    emit,
    sent,
    channels,
    input,
    outputs,
    stream,
    peers,
    audio,
    getUserMedia,
    fetch,
    onState,
    onFinalizedInput,
    onDelegation,
    onAppendResult,
    speech,
  };
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const connect = async (fixture: ReturnType<typeof setup>) => {
  await fixture.conversation.start();
  fixture.emit(0, { type: "session.started" });
  fixture.emit(1, { type: "session.created" });
};

test("invalid start-time words fail before microphone capture without an unhandled rejection", async () => {
  const fixture = setup({
    readWords: () => {
      throw new Error("Words are still loading");
    },
  });
  await expect(fixture.conversation.start()).resolves.toBeUndefined();
  expect(fixture.getUserMedia).not.toHaveBeenCalled();
  expect(fixture.fetch).not.toHaveBeenCalled();
  expect(fixture.onState).toHaveBeenLastCalledWith(
    expect.objectContaining({ phase: "error" }),
  );
});

test("both Live requests and the guard use one snapshot despite edits during connection", async () => {
  let words = [{ spelling: "RelayDesk" }];
  const readWords = vi.fn(() => words);
  const fixture = setup({ readWords });
  const headers: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      headers.push(
        new Headers(init.headers).get("x-petrinaut-voice-words") ?? "",
      );
      words = [{ spelling: "NewDraft" }];
      return Response.json({ sdp: "v=0", sessionId: "opaque" });
    }),
  );
  await connect(fixture);
  expect(readWords).toHaveBeenCalledOnce();
  expect(headers).toHaveLength(2);
  expect(headers[0]).toBe(headers[1]);
  expect(JSON.parse(atob(headers[0]!))).toEqual({
    version: 1,
    entries: [{ spelling: "RelayDesk" }],
  });
  fixture.emit(1, {
    type: "input_audio_buffer.speech_started",
    item_id: "word",
  });
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "word",
    previous_item_id: null,
  });
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "word",
    transcript: "RelayDesk",
    content_index: 0,
  });
  expect(fixture.onFinalizedInput).toHaveBeenCalledOnce();
  expect(
    fixture.onFinalizedInput.mock.calls[0]?.[0].transcriptionPrompt,
  ).toContain("RelayDesk");
  expect(
    fixture.onFinalizedInput.mock.calls[0]?.[0].transcriptionPrompt,
  ).not.toContain("NewDraft");
  const stopped = fixture.conversation.stop();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
});

test("a transcript finalized after newer speech keeps its identity but cannot revive old speech", async () => {
  const fixture = setup();
  await connect(fixture);
  fixture.emit(1, {
    type: "input_audio_buffer.speech_started",
    item_id: "old",
  });
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "old",
    previous_item_id: null,
  });
  fixture.emit(1, {
    type: "input_audio_buffer.speech_started",
    item_id: "new",
  });
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "old",
    content_index: 0,
    transcript: "Old request",
  });
  expect(fixture.onFinalizedInput).toHaveBeenCalledWith(
    expect.objectContaining({ text: "Old request", superseded: true }),
  );
  const stopped = fixture.conversation.stop();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
});

test("projects only actual Live transcript deltas and reports injection time without claiming playback", async () => {
  const fixture = setup();
  await connect(fixture);
  fixture.emit(1, {
    type: "input_audio_buffer.speech_started",
    item_id: "input",
  });
  expect(fixture.speech.started).toHaveBeenCalledOnce();
  fixture.emit(0, {
    type: "session.input_transcript.delta",
    event_id: "in",
    delta: "Hello",
    start_ms: 100,
    end_ms: 200,
  });
  fixture.emit(0, {
    type: "session.output_transcript.delta",
    event_id: "out",
    delta: "I can help.",
    start_ms: 300,
    end_ms: 400,
  });
  expect(fixture.speech.input).toHaveBeenCalledWith({
    id: "in",
    text: "Hello",
    startMs: 100,
    endMs: 200,
  });
  expect(fixture.speech.output).toHaveBeenCalledExactlyOnceWith({
    id: "out",
    text: "I can help.",
    startMs: 300,
    endMs: 400,
  });
  fixture.conversation.appendCommentary("Not a caption", null);
  const sent = JSON.parse(fixture.sent[0].at(-1)!) as { event_id: string };
  fixture.emit(0, {
    type: "session.commentary.appended",
    client_event_id: sent.event_id,
    start_ms: 500,
    end_ms: 600,
  });
  expect(fixture.onAppendResult).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: "accepted", startMs: 500 }),
  );
  expect(fixture.speech.output).toHaveBeenCalledOnce();
  fixture.emit(0, {
    type: "session.output_transcript.delta",
    delta: "Malformed",
    start_ms: -1,
    end_ms: "400",
  });
  expect(fixture.speech.output).toHaveBeenCalledOnce();
  const stopped = fixture.conversation.stop();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
  expect(fixture.speech.closed).toHaveBeenCalled();
});

test("stops voice preview before reopening the Live microphone", async () => {
  const settings = new VoiceAudioSettings("live", undefined);
  const fixture = setup({ audioSettings: settings });
  await connect(fixture);
  fixture.conversation.setMicrophoneMuted(true);
  const stop = vi
    .spyOn(settings.actions, "stopVoicePreview")
    .mockImplementation(() => {
      expect(fixture.input.enabled).toBe(false);
    });
  fixture.conversation.setMicrophoneMuted(false);
  expect(stop).toHaveBeenCalledOnce();
  expect(fixture.input.enabled).toBe(true);
  stop.mockRestore();
  const stopped = fixture.conversation.stop();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
});

test("wires selected voice and both Live senders to session-owned audio settings", async () => {
  const settings = new VoiceAudioSettings("live", undefined, {
    getItem: () => "quartz",
    setItem: vi.fn(),
  });
  const attach = vi.spyOn(settings, "attach");
  const detach = vi.spyOn(settings, "detach");
  const fixture = setup({ audioSettings: settings });
  await connect(fixture);
  expect(fixture.fetch).toHaveBeenCalledWith(
    "/api/voice/live-session",
    expect.objectContaining({
      headers: {
        "content-type": "application/sdp",
        "x-petrinaut-voice": "quartz",
      },
    }),
  );
  expect(fixture.fetch).toHaveBeenCalledWith(
    "/api/voice/transcription-session",
    expect.objectContaining({
      headers: { "content-type": "application/sdp" },
    }),
  );
  expect(attach).toHaveBeenCalledOnce();
  const connection = attach.mock.calls[0]?.[0];
  expect(connection?.senders).toHaveLength(2);
  fixture.conversation.setMicrophoneMuted(true);
  fixture.conversation.setSpeakerVolume(0.4);
  const replacement = { enabled: true, stop: vi.fn() };
  connection?.replaceMicrophone({
    getAudioTracks: () => [replacement],
    getTracks: () => [replacement],
  } as unknown as MediaStream);
  expect(replacement.enabled).toBe(false);
  expect(fixture.audio.volume).toBe(0.4);
  detach.mockClear();
  const stopped = fixture.conversation.stop();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
  expect(detach).toHaveBeenCalledOnce();
  expect(replacement.stop).toHaveBeenCalled();
});

test.each([true, false])(
  "diagnostic trace is development-only (%s) and excludes provider content",
  async (development) => {
    vi.stubEnv("DEV", development);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const fixture = setup();
    await connect(fixture);
    fixture.emit(1, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "diagnostic-item",
      content_index: 0,
      transcript: "PRIVATE TRANSCRIPT",
    });
    fixture.emit(0, {
      type: "session.delegation.created",
      offset_ms: 710,
      delegation: {
        id: "diagnostic-delegation",
        target: "client",
        metadata: { secret: "PRIVATE DELEGATION" },
      },
    });
    fixture.emit(1, {
      type: "input_audio_buffer.committed",
      item_id: "diagnostic-item",
      previous_item_id: null,
    });
    fixture.conversation.appendCommentary(
      "PRIVATE ANSWER",
      "diagnostic-delegation",
    );
    const append = fixture.onAppendResult.mock.lastCall![0];
    fixture.emit(0, {
      type: "session.commentary.appended",
      client_event_id: append.eventId,
    });
    const stopped = fixture.conversation.stop();
    fixture.emit(0, { type: "session.closed" });
    await stopped;
    if (!development) {
      expect(debug).not.toHaveBeenCalled();
      return;
    }
    const records = debug.mock.calls.map(
      ([line]) =>
        JSON.parse(
          String(line).replace("[Petrinaut Live trace] ", ""),
        ) as Record<string, unknown>,
    );
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "provider.event",
          connection: "live",
          type: "session.delegation.created",
          delegationId: "diagnostic-delegation",
          offsetMs: 710,
        }),
        expect.objectContaining({
          event: "input.finalized",
          itemId: "diagnostic-item",
        }),
        expect.objectContaining({
          event: "append.result",
          eventId: append.eventId,
          status: "unknown",
        }),
        expect.objectContaining({
          event: "append.result",
          eventId: append.eventId,
          status: "accepted",
        }),
        expect.objectContaining({
          event: "session.finished",
          liveConfirmed: true,
        }),
      ]),
    );
    expect(
      records.find((record) => record.event === "input.finalized")?.inputId,
    ).toMatch(/^voice-live:[^:]+:diagnostic-item:0$/u);
    expect(
      records.every(
        (record) =>
          typeof record.sessionId === "string" && typeof record.at === "string",
      ),
    ).toBe(true);
    expect(JSON.stringify(records)).not.toContain("PRIVATE");
    expect(fixture.fetch).toHaveBeenCalledTimes(2);
    expect(fixture.getUserMedia).toHaveBeenCalledOnce();
  },
);

test.each([0, 1] as const)(
  "connection %s recovers without replacing sessions or replaying finalized input",
  async (connection) => {
    vi.useFakeTimers();
    const fixture = setup();
    let release = (_stats: Map<string, unknown>) => {};
    fixture.peers[0]!.getStats.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await connect(fixture);
    await vi.advanceTimersByTimeAsync(100);
    const peer = fixture.peers[connection]!;
    peer.connectionState = "disconnected";
    peer.dispatchEvent(new Event("connectionstatechange"));
    expect(fixture.input.stop).not.toHaveBeenCalled();
    expect(fixture.audio.pause).not.toHaveBeenCalled();
    release(new Map());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fixture.onState.mock.lastCall?.[0].phase).toBe("connecting");
    // Completed, ordered events still use the existing admission path.
    const completed = {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "one",
      content_index: 0,
      transcript: "Actually, three machines",
    };
    fixture.emit(1, {
      type: "input_audio_buffer.committed",
      item_id: "one",
      previous_item_id: null,
    });
    fixture.emit(1, completed);
    expect(fixture.onFinalizedInput).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ text: "Actually, three machines" }),
    );
    expect(fixture.conversation.appendCommentary("Settled answer", null)).toBe(
      true,
    );
    peer.connectionState = "connected";
    peer.dispatchEvent(new Event("connectionstatechange"));
    expect(fixture.onState.mock.lastCall?.[0].phase).toBe("connected");
    fixture.emit(1, completed);
    await vi.advanceTimersByTimeAsync(16_000);
    expect(fixture.input.stop).not.toHaveBeenCalled();
    expect(fixture.onFinalizedInput).toHaveBeenCalledOnce();
    expect(fixture.sent[0]).toHaveLength(1);
    expect(fixture.sent[1]).toEqual([]);
    expect(fixture.fetch).toHaveBeenCalledTimes(2);
    expect(fixture.getUserMedia).toHaveBeenCalledOnce();
    const stopped = fixture.conversation.stop();
    fixture.emit(0, { type: "session.closed" });
    await stopped;
    expect(vi.getTimerCount()).toBe(0);
  },
);

test.each([0, 1] as const)(
  "connection %s has a fixed recovery deadline and cannot revive after timeout",
  async (connection) => {
    vi.useFakeTimers();
    const fixture = setup();
    await connect(fixture);
    const peer = fixture.peers[connection]!;
    peer.connectionState = "disconnected";
    peer.dispatchEvent(new Event("connectionstatechange"));
    await vi.advanceTimersByTimeAsync(5_000);
    peer.dispatchEvent(new Event("connectionstatechange"));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fixture.input.stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.input.stop).toHaveBeenCalled();
    expect(fixture.audio.pause).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fixture.onState.mock.lastCall?.[0].phase).toBe("error");
    expect(fixture.onState.mock.lastCall?.[0].message).toContain(
      "did not recover",
    );
    const updates = fixture.onState.mock.calls.length;
    peer.connectionState = "connected";
    peer.dispatchEvent(new Event("connectionstatechange"));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fixture.onState).toHaveBeenCalledTimes(updates);
    expect(fixture.fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  },
);

test("recovering one peer does not clear the other peer's deadline or show connected", async () => {
  vi.useFakeTimers();
  const fixture = setup();
  await connect(fixture);
  const live = fixture.peers[0]!;
  const transcription = fixture.peers[1]!;
  live.connectionState = "disconnected";
  live.dispatchEvent(new Event("connectionstatechange"));
  await vi.advanceTimersByTimeAsync(5_000);
  transcription.connectionState = "disconnected";
  transcription.dispatchEvent(new Event("connectionstatechange"));
  live.connectionState = "connected";
  live.dispatchEvent(new Event("connectionstatechange"));
  await vi.advanceTimersByTimeAsync(14_999);
  expect(fixture.input.stop).not.toHaveBeenCalled();
  expect(fixture.onState.mock.lastCall?.[0].phase).toBe("connecting");
  await vi.advanceTimersByTimeAsync(1);
  expect(fixture.input.stop).toHaveBeenCalled();
  fixture.emit(0, { type: "session.closed" });
  expect(fixture.onState.mock.lastCall?.[0].message).toContain(
    "Transcription media connection did not recover",
  );
  expect(vi.getTimerCount()).toBe(0);
});

test.each([0, 1] as const)(
  "a handshake disconnect on connection %s stays bounded after both ready events",
  async (connection) => {
    vi.useFakeTimers();
    const fixture = setup();
    await fixture.conversation.start();
    const peer = fixture.peers[connection]!;
    peer.connectionState = "disconnected";
    peer.dispatchEvent(new Event("connectionstatechange"));
    await vi.advanceTimersByTimeAsync(5_000);
    fixture.emit(0, { type: "session.started" });
    fixture.emit(1, { type: "session.created" });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(fixture.input.stop).not.toHaveBeenCalled();
    expect(fixture.onState.mock.lastCall?.[0].phase).toBe("connecting");
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.input.stop).toHaveBeenCalled();
    fixture.emit(0, { type: "session.closed" });
    expect(vi.getTimerCount()).toBe(0);
  },
);

test("Stop cancels both recovery deadlines and ignores late connections", async () => {
  vi.useFakeTimers();
  const fixture = setup();
  await connect(fixture);
  for (const peer of fixture.peers) {
    peer.connectionState = "disconnected";
    peer.dispatchEvent(new Event("connectionstatechange"));
  }
  expect(fixture.input.stop).not.toHaveBeenCalled();
  const stopped = fixture.conversation.stop();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
  const updates = fixture.onState.mock.calls.length;
  for (const peer of fixture.peers) {
    peer.connectionState = "connected";
    peer.dispatchEvent(new Event("connectionstatechange"));
  }
  await vi.advanceTimersByTimeAsync(20_000);
  expect(fixture.onState).toHaveBeenCalledTimes(updates);
  expect(fixture.onState.mock.lastCall?.[0].phase).toBe("ended");
  expect(vi.getTimerCount()).toBe(0);
});

test.each([
  [0, "failed"],
  [0, "closed"],
  [1, "failed"],
  [1, "closed"],
] as const)(
  "terminal connection %s state %s still stops immediately",
  async (connection, state) => {
    const fixture = setup();
    await connect(fixture);
    const peer = fixture.peers[connection]!;
    peer.connectionState = state;
    peer.dispatchEvent(new Event("connectionstatechange"));
    expect(fixture.input.stop).toHaveBeenCalled();
    expect(fixture.audio.pause).toHaveBeenCalled();
    fixture.emit(0, { type: "session.closed" });
    expect(fixture.onState.mock.lastCall?.[0].phase).toBe("error");
  },
);

test("starts Live and transcription WebRTC from one consented capture and connects only when both are usable", async () => {
  const fixture = setup();
  await fixture.conversation.start();
  expect(fixture.getUserMedia).toHaveBeenCalledOnce();
  expect(fixture.getUserMedia).toHaveBeenCalledWith({
    audio: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
  expect(fixture.fetch.mock.calls.map(([url]) => url)).toEqual([
    "/api/voice/live-session",
    "/api/voice/transcription-session",
  ]);
  expect(fixture.peers[0]!.addTrack).toHaveBeenCalledWith(
    fixture.input,
    fixture.stream,
  );
  expect(fixture.peers[1]!.addTrack).toHaveBeenCalledWith(
    fixture.input,
    fixture.stream,
  );
  fixture.emit(0, { type: "session.started" });
  expect(fixture.onState.mock.lastCall?.[0].phase).toBe("connecting");
  fixture.emit(1, { type: "session.created" });
  expect(fixture.onState).toHaveBeenLastCalledWith({
    phase: "connected",
    message: null,
  });
});

test("applies cached settings and fresh defaults to newly created Live media", async () => {
  const cached = setup({
    audioMuted: false,
    audioVolume: 0.8,
    inputEnabled: true,
  });
  cached.conversation.setMicrophoneMuted(true);
  cached.conversation.setSpeakerMuted(true);
  cached.conversation.setSpeakerVolume(0.3);

  await connect(cached);

  expect(cached.input.enabled).toBe(false);
  expect(cached.audio).toMatchObject({ muted: true, volume: 0.3 });

  const fresh = setup({
    audioMuted: true,
    audioVolume: 0.2,
    inputEnabled: false,
  });
  await connect(fresh);

  expect(fresh.input.enabled).toBe(true);
  expect(fresh.audio).toMatchObject({ muted: false, volume: 1 });
});

test("mutes the one shared capture without disturbing output or finalized input", async () => {
  const fixture = setup();
  await connect(fixture);
  const remoteStream = { getTracks: () => [fixture.outputs[0]!] };
  fixture.peers[0]!.dispatchEvent(
    Object.assign(new Event("track"), {
      track: fixture.outputs[0]!,
      streams: [remoteStream],
    }),
  );

  fixture.conversation.setMicrophoneMuted(true);

  expect(fixture.input.enabled).toBe(false);
  expect(fixture.getUserMedia).toHaveBeenCalledOnce();
  expect(fixture.peers[0]!.addTrack).toHaveBeenCalledWith(
    fixture.input,
    fixture.stream,
  );
  expect(fixture.peers[1]!.addTrack).toHaveBeenCalledWith(
    fixture.input,
    fixture.stream,
  );
  expect(fixture.input.stop).not.toHaveBeenCalled();
  expect(fixture.audio).toMatchObject({
    muted: false,
    paused: false,
    srcObject: remoteStream,
  });
  expect(fixture.audio.pause).not.toHaveBeenCalled();

  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "started-before-mute",
    previous_item_id: null,
  });
  const completion = {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "started-before-mute",
    content_index: 0,
    transcript: "Keep this finalized answer.",
  };
  fixture.emit(1, completion);
  fixture.emit(1, completion);
  expect(fixture.onFinalizedInput).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ text: "Keep this finalized answer." }),
  );

  fixture.conversation.setMicrophoneMuted(false);
  expect(fixture.input.enabled).toBe(true);
});

test("keeps speaker mute and clamped volume local and independent", async () => {
  const fixture = setup();
  await connect(fixture);
  const sentBefore = fixture.sent.map((events) => [...events]);

  fixture.conversation.setSpeakerVolume(2);
  fixture.conversation.setSpeakerMuted(true);
  fixture.conversation.setSpeakerVolume(-0.5);

  expect(fixture.audio.volume).toBe(0);
  expect(fixture.audio.muted).toBe(true);
  expect(fixture.input.enabled).toBe(true);
  expect(fixture.sent).toEqual(sentBefore);
  expect(fixture.audio.pause).not.toHaveBeenCalled();
  expect(fixture.input.stop).not.toHaveBeenCalled();

  fixture.conversation.setSpeakerVolume(0.35);
  fixture.conversation.setSpeakerMuted(false);
  expect(fixture.audio).toMatchObject({ muted: false, volume: 0.35 });
});

test("emits only completed transcripts in committed provider order and deduplicates identical events", async () => {
  const fixture = setup();
  await connect(fixture);
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "second",
    content_index: 0,
    transcript: "Second",
  });
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "first",
    content_index: 0,
    transcript: "First",
  });
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "first",
    previous_item_id: null,
  });
  expect(fixture.onFinalizedInput.mock.lastCall?.[0].id).toMatch(
    /^voice-live:[^:]+:first:0$/u,
  );
  expect(fixture.onFinalizedInput.mock.lastCall?.[0].text).toBe("First");
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "second",
    previous_item_id: "first",
  });
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "second",
    content_index: 0,
    transcript: "Second",
  });
  expect(
    fixture.onFinalizedInput.mock.calls.map(([input]) => input.text),
  ).toEqual(["First", "Second"]);
  expect(fixture.onFinalizedInput.mock.lastCall?.[0].id).toMatch(
    /^voice-live:[^:]+:second:0$/u,
  );
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.delta",
    item_id: "third",
    delta: "ignored",
  });
  fixture.emit(0, { type: "session.input_transcript.delta", delta: "ignored" });
  expect(fixture.onFinalizedInput).toHaveBeenCalledTimes(2);
});

test("conflicting transcript identity fails visibly, stops both connections, and ignores late callbacks", async () => {
  const fixture = setup();
  await connect(fixture);
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "one",
    previous_item_id: null,
  });
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "one",
    content_index: 0,
    transcript: "One",
  });
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "one",
    content_index: 0,
    transcript: "Changed",
  });
  expect(fixture.input.stop).toHaveBeenCalledOnce();
  expect(fixture.audio.pause).toHaveBeenCalled();
  fixture.emit(0, { type: "session.closed" });
  expect(fixture.onState.mock.lastCall?.[0]).toMatchObject({ phase: "error" });
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "late",
    content_index: 0,
    transcript: "Late",
  });
  expect(fixture.onFinalizedInput).toHaveBeenCalledTimes(1);
});

test.each([true, false])(
  "transcription failure silences immediately and gives ready Live bounded graceful closure (confirmed: %s)",
  async (confirmed) => {
    vi.useFakeTimers();
    const fixture = setup();
    await fixture.conversation.start();
    fixture.emit(0, { type: "session.started" });
    fixture.emit(1, {
      type: "conversation.item.input_audio_transcription.failed",
      item_id: "one",
    });
    expect(fixture.input.stop).toHaveBeenCalledOnce();
    expect(fixture.audio.muted).toBe(true);
    expect(fixture.channels[1].close).toHaveBeenCalledOnce();
    expect(fixture.channels[0].close).not.toHaveBeenCalled();
    expect(fixture.sent[0]).toEqual([
      JSON.stringify({ type: "session.close" }),
    ]);
    expect(fixture.onState.mock.lastCall?.[0].phase).toBe("stopping");
    expect(fixture.onState.mock.lastCall?.[0].message).toContain(
      "Transcription failed",
    );
    fixture.emit(1, { type: "session.created" });
    fixture.emit(0, { type: "session.started" });
    expect(fixture.conversation.appendCommentary("Late answer", null)).toBe(
      false,
    );
    if (confirmed) fixture.emit(0, { type: "session.closed" });
    else await vi.advanceTimersByTimeAsync(2_000);
    expect(fixture.onState.mock.lastCall?.[0]).toMatchObject({
      phase: "error",
    });
    expect(fixture.onState.mock.lastCall?.[0].message).toContain(
      "Transcription failed",
    );
    expect(fixture.onState.mock.lastCall?.[0].message).toContain(
      confirmed
        ? "Live confirmed session closure"
        : "Remote Live session closure was not confirmed",
    );
    expect(fixture.fetch).toHaveBeenCalledTimes(2);
    expect(fixture.peers[0]!.close).toHaveBeenCalledOnce();
    expect(fixture.peers[1]!.close).toHaveBeenCalled();
  },
);

test("tracks only client delegations once without admitting their metadata as input", async () => {
  const fixture = setup();
  await connect(fixture);
  for (const delegation of [
    { id: "opaque/first", target: "client" },
    { id: "responses", target: "responses" },
    { id: "opaque/second", target: "client" },
    { id: "opaque/first", target: "client" },
    { id: 1, target: "client" },
    null,
  ])
    fixture.emit(0, { type: "session.delegation.created", delegation });
  expect(fixture.onDelegation.mock.calls).toEqual([
    ["opaque/first"],
    ["opaque/second"],
  ]);
  expect([...fixture.conversation.openDelegations]).toEqual([
    "opaque/first",
    "opaque/second",
  ]);
  expect(fixture.onFinalizedInput).not.toHaveBeenCalled();
  expect(fixture.sent[0]).toEqual([]);
});

test.each(["commentary", "instructions"] as const)(
  "%s sends intact >500-byte content with unique IDs and correlates only matching acknowledgements",
  async (kind) => {
    const fixture = setup();
    await connect(fixture);
    fixture.emit(0, {
      type: "session.delegation.created",
      delegation: { id: "opaque", target: "client" },
    });
    const append =
      kind === "commentary"
        ? fixture.conversation.appendCommentary
        : fixture.conversation.appendInstructions;
    const content = "Seven reviewers, not four. ".repeat(30) + "😀";
    expect(new TextEncoder().encode(content).byteLength).toBeGreaterThan(500);
    expect(append(content, "opaque")).toBe(true);
    const first = fixture.onAppendResult.mock.lastCall![0];
    expect(first.status).toBe("unknown");
    expect(JSON.parse(fixture.sent[0][0]!)).toEqual({
      type: `session.${kind}.append`,
      event_id: first.eventId,
      delegation_id: "opaque",
      content,
    });
    expect(append("Second", null)).toBe(true);
    const second = fixture.onAppendResult.mock.lastCall![0];
    expect(second.eventId).not.toBe(first.eventId);
    expect(JSON.parse(fixture.sent[0][1]!)).toEqual({
      type: `session.${kind}.append`,
      event_id: second.eventId,
      delegation_id: null,
      content: "Second",
    });
    const acknowledgement = {
      type: `session.${kind}.appended`,
      client_event_id: first.eventId,
    };
    fixture.emit(0, { ...acknowledgement, client_event_id: "unrelated" });
    fixture.emit(0, { type: acknowledgement.type, event_id: first.eventId });
    fixture.emit(0, {
      ...acknowledgement,
      type:
        kind === "commentary"
          ? "session.instructions.appended"
          : "session.commentary.appended",
    });
    expect(fixture.onAppendResult).toHaveBeenCalledTimes(2);
    expect(fixture.conversation.openDelegations.has("opaque")).toBe(true);
    fixture.emit(0, acknowledgement);
    expect(fixture.onAppendResult.mock.lastCall![0]).toEqual({
      ...first,
      status: "accepted",
    });
    expect(fixture.conversation.openDelegations.size).toBe(0);
    fixture.emit(0, acknowledgement);
    fixture.emit(0, {
      type: "session.delegation.created",
      delegation: { id: "opaque", target: "client" },
    });
    expect(fixture.onAppendResult).toHaveBeenCalledTimes(3);
    expect(fixture.onDelegation).toHaveBeenCalledOnce();
    expect(fixture.sent[0]).toHaveLength(2);
  },
);

test.each([
  ["commentary", "nested"],
  ["commentary", "top-level"],
  ["instructions", "nested"],
  ["instructions", "top-level"],
] as const)(
  "%s distinguishes local failure from %s provider rejection without exposing provider text or retrying",
  async (kind, correlationLocation) => {
    const fixture = setup();
    const append =
      kind === "commentary"
        ? fixture.conversation.appendCommentary
        : fixture.conversation.appendInstructions;
    expect(append("Not connected", "opaque")).toBe(false);
    expect(fixture.onAppendResult.mock.lastCall![0].status).toBe(
      "local-failure",
    );
    await connect(fixture);
    const send = vi
      .spyOn(fixture.channels[0], "send")
      .mockImplementationOnce(() => {
        throw new Error("Local failure");
      });
    expect(append("Cannot send", "opaque")).toBe(false);
    const failed = fixture.onAppendResult.mock.lastCall![0];
    expect(failed.status).toBe("local-failure");
    fixture.emit(0, {
      type: `session.${kind}.appended`,
      client_event_id: failed.eventId,
    });
    expect(fixture.onAppendResult).toHaveBeenCalledTimes(2);
    expect(append("Accepted locally", "opaque")).toBe(true);
    const pending = fixture.onAppendResult.mock.lastCall![0];
    const rejection = (eventId: string) => ({
      type: "error",
      ...(correlationLocation === "top-level"
        ? { client_event_id: eventId }
        : {}),
      error: {
        message: "secret",
        ...(correlationLocation === "nested"
          ? { client_event_id: eventId }
          : {}),
      },
    });
    fixture.emit(0, rejection("unrelated"));
    expect(fixture.onAppendResult).toHaveBeenCalledTimes(3);
    expect(fixture.onState.mock.lastCall![0].phase).toBe("connected");
    fixture.emit(0, rejection(pending.eventId));
    expect(fixture.onAppendResult.mock.lastCall![0]).toEqual({
      ...pending,
      status: "rejected",
    });
    fixture.emit(0, rejection(pending.eventId));
    fixture.emit(0, {
      type: `session.${kind}.appended`,
      client_event_id: pending.eventId,
    });
    expect(fixture.onAppendResult).toHaveBeenCalledTimes(4);
    expect(fixture.onState.mock.lastCall![0].phase).toBe("connected");
    expect(send).toHaveBeenCalledTimes(2);
    expect(fixture.sent[0]).toHaveLength(1);
  },
);

test("Stop invalidates pending appends and delegations before closure; late events cannot change outcomes", async () => {
  const fixture = setup();
  await connect(fixture);
  fixture.emit(0, {
    type: "session.delegation.created",
    delegation: { id: "opaque", target: "client" },
  });
  fixture.conversation.appendCommentary("Settled answer", "opaque");
  fixture.conversation.appendInstructions("Ask the person to continue", null);
  const pending = fixture.onAppendResult.mock.calls.map(([result]) => result);
  const stop = fixture.conversation.stop();
  expect(fixture.conversation.openDelegations.size).toBe(0);
  for (const closed of [false, true]) {
    if (closed) {
      fixture.emit(0, { type: "session.closed" });
      await stop;
    }
    for (const result of pending) {
      fixture.emit(0, {
        type: `session.${result.kind}.appended`,
        client_event_id: result.eventId,
      });
      fixture.emit(0, {
        type: "error",
        error: { client_event_id: result.eventId },
      });
      fixture.emit(0, {
        type: "error",
        client_event_id: result.eventId,
        error: { message: "Late rejection" },
      });
    }
    fixture.emit(0, {
      type: "session.delegation.created",
      delegation: { id: "late", target: "client" },
    });
    expect(fixture.conversation.appendCommentary("Late", null)).toBe(false);
    expect(fixture.conversation.appendInstructions("Late", "opaque")).toBe(
      false,
    );
  }
  expect(fixture.onAppendResult).toHaveBeenCalledTimes(2);
  expect(fixture.onDelegation).toHaveBeenCalledOnce();
  expect(fixture.conversation.openDelegations.size).toBe(0);
  expect(fixture.sent[0]).toHaveLength(3); // Two appends and session.close, no replay.
});

test("Stop synchronously silences playback and capture, closes both transports, and does not claim transcription closure", async () => {
  vi.useFakeTimers();
  const fixture = setup();
  await connect(fixture);
  const stopped = fixture.conversation.stop();
  expect(fixture.input.stop).toHaveBeenCalledOnce();
  expect(fixture.audio.pause).toHaveBeenCalledOnce();
  expect(fixture.sent[0].map((event) => JSON.parse(event))).toContainEqual({
    type: "session.close",
  });
  expect(fixture.channels[1].close).toHaveBeenCalledOnce();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
  expect(fixture.onState.mock.lastCall?.[0].message).toBe(
    "Microphone and playback stopped. Live confirmed session closure.",
  );
});

test("late media settings cannot change a stopped session", async () => {
  const fixture = setup();
  await connect(fixture);

  const stopped = fixture.conversation.stop();
  expect(fixture.audio).toMatchObject({ muted: true, volume: 1 });
  expect(fixture.input.enabled).toBe(true);

  fixture.conversation.setMicrophoneMuted(true);
  fixture.conversation.setSpeakerMuted(false);
  fixture.conversation.setSpeakerVolume(0.2);

  expect(fixture.input.enabled).toBe(true);
  expect(fixture.audio).toMatchObject({ muted: true, volume: 1 });
  expect(fixture.audio.pause).toHaveBeenCalledOnce();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
});

test("a failure on either media connection stops both and remote audio remains native and unbuffered", async () => {
  const fixture = setup();
  await connect(fixture);
  const remoteStream = { getTracks: () => [fixture.outputs[0]!] };
  fixture.peers[0]!.dispatchEvent(
    Object.assign(new Event("track"), {
      track: fixture.outputs[0]!,
      streams: [remoteStream],
    }),
  );
  expect(fixture.audio.srcObject).toBe(remoteStream);
  expect(fixture.audio.autoplay).toBe(true);
  expect(fixture.audio.play).toHaveBeenCalledOnce();
  Object.assign(fixture.peers[1]!, { connectionState: "failed" });
  fixture.peers[1]!.dispatchEvent(new Event("connectionstatechange"));
  expect(fixture.input.stop).toHaveBeenCalledOnce();
  expect(fixture.peers[1]!.close).toHaveBeenCalledOnce();
  fixture.emit(0, { type: "session.closed" });
  expect(fixture.peers[0]!.close).toHaveBeenCalledOnce();
});

test.each(["rejects", "throws"] as const)(
  "reports playback that %s and retries it without restarting either Live session",
  async (failureMode) => {
    vi.useFakeTimers();
    const fixture = setup();
    fixture.peers[0]!.getStats.mockResolvedValue(
      new Map([
        ["input", { type: "media-source", kind: "audio", audioLevel: 0.42 }],
      ]),
    );
    if (failureMode === "rejects") {
      fixture.audio.play.mockRejectedValueOnce(new Error("Playback blocked"));
    } else {
      fixture.audio.play.mockImplementationOnce(() => {
        throw new Error("Playback blocked");
      });
    }
    await connect(fixture);
    await vi.advanceTimersByTimeAsync(100);
    fixture.peers[0]!.dispatchEvent(
      Object.assign(new Event("track"), {
        track: fixture.outputs[0],
        streams: [fixture.stream],
      }),
    );
    await Promise.resolve();

    expect(fixture.onState).toHaveBeenLastCalledWith({
      phase: "connected",
      message: "Audio blocked. Select Play to listen.",
      playbackBlocked: true,
      activity: { microphoneLevel: 0.42, outputActive: false },
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(fixture.onState.mock.lastCall?.[0]).toMatchObject({
      phase: "connected",
      message: "Audio blocked. Select Play to listen.",
      playbackBlocked: true,
    });
    expect(fixture.input.stop).not.toHaveBeenCalled();
    expect(fixture.outputs[0]!.stop).not.toHaveBeenCalled();
    await fixture.conversation.retryPlayback();
    expect(fixture.audio.play).toHaveBeenCalledTimes(2);
    expect(fixture.onState).toHaveBeenLastCalledWith({
      phase: "connected",
      message: null,
      activity: { microphoneLevel: 0.42, outputActive: false },
    });
    expect(fixture.fetch).toHaveBeenCalledTimes(2);
    expect(fixture.getUserMedia).toHaveBeenCalledOnce();
    const stopped = fixture.conversation.stop();
    fixture.emit(0, { type: "session.closed" });
    await stopped;
    expect(vi.getTimerCount()).toBe(0);
  },
);

test("late transcription while waiting for Live closure cannot submit or revive the session", async () => {
  const fixture = setup();
  await connect(fixture);
  const stopped = fixture.conversation.stop();
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "late",
    previous_item_id: null,
  });
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "late",
    content_index: 0,
    transcript: "Do not submit",
  });
  expect(fixture.onFinalizedInput).not.toHaveBeenCalled();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
});

test("provider item identities are namespaced to the consented local session", async () => {
  const ids: string[] = [];
  for (let index = 0; index < 2; index++) {
    const fixture = setup();
    await connect(fixture);
    fixture.emit(1, {
      type: "input_audio_buffer.committed",
      item_id: "one",
      previous_item_id: null,
    });
    fixture.emit(1, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "one",
      content_index: 0,
      transcript: "Same words",
    });
    ids.push(fixture.onFinalizedInput.mock.calls[0]![0].id);
    fixture.emit(0, { type: "session.closed" });
  }
  expect(ids[0]).not.toBe(ids[1]);
});

test("a conflicting committed successor fails rather than silently dropping a correction", async () => {
  const fixture = setup();
  await connect(fixture);
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "one",
    previous_item_id: null,
  });
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "two",
    previous_item_id: "one",
  });
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "three",
    previous_item_id: "one",
  });
  fixture.emit(0, { type: "session.closed" });
  expect(fixture.onState.mock.lastCall?.[0].phase).toBe("error");
});

test("permission resolving after Stop cannot start either provider", async () => {
  const fixture = setup();
  let release = (_stream: typeof fixture.stream) => {};
  fixture.getUserMedia.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const start = fixture.conversation.start();
  await fixture.conversation.stop();
  release(fixture.stream);
  await start;
  expect(fixture.input.stop).toHaveBeenCalledOnce();
  expect(fixture.fetch).not.toHaveBeenCalled();
});

test.each([0, 1] as const)(
  "identifies the unfinished connection after the other session is ready: %s",
  async (readyConnection) => {
    vi.useFakeTimers();
    const fixture = setup();
    await fixture.conversation.start();
    fixture.emit(readyConnection, {
      type: readyConnection === 0 ? "session.started" : "session.created",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    const message = fixture.onState.mock.lastCall?.[0].message;
    expect(message).toContain(
      readyConnection === 0
        ? "transcription: waiting for session.created"
        : "live: waiting for session.started",
    );
    expect(message).not.toContain(
      readyConnection === 0 ? "live: waiting" : "transcription: waiting",
    );
    expect(fixture.fetch).toHaveBeenCalledTimes(2);
  },
);

test("reports the failed endpoint and HTTP statuses without reflecting response content", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const fixture = setup();
  fixture.fetch.mockImplementation(async (url) =>
    url.endsWith("live-session")
      ? new Response("sensitive provider response", {
          status: 502,
          headers: { "x-voice-upstream-status": "401" },
        })
      : new Promise<Response>(() => {}),
  );
  await fixture.conversation.start();
  expect(fixture.onState.mock.lastCall?.[0].phase).toBe("error");
  expect(fixture.onState.mock.lastCall?.[0].message).toContain(
    "live session request failed (HTTP 502, provider HTTP 401)",
  );
  expect(fixture.onState.mock.lastCall?.[0].message).not.toContain("sensitive");
  expect(warning).toHaveBeenCalledExactlyOnceWith(
    "[Petrinaut Live]",
    "live session request failed (HTTP 502, provider HTTP 401).",
  );
  expect(fixture.input.stop).toHaveBeenCalledOnce();
  expect(
    fixture.peers.every((peer) => peer.close.mock.calls.length === 1),
  ).toBe(true);
});

test("timeout identifies a pending transcription HTTP response rather than blaming microphone permission", async () => {
  vi.useFakeTimers();
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const fixture = setup();
  fixture.fetch.mockImplementation(async (url) =>
    url.endsWith("transcription-session")
      ? new Promise<Response>(() => {})
      : Response.json({ sdp: "v=0\r\no=answer" }),
  );
  void fixture.conversation.start();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(fixture.onState.mock.lastCall?.[0].message).toContain(
    "transcription: waiting for session HTTP response",
  );
  expect(warning).toHaveBeenCalledExactlyOnceWith(
    "[Petrinaut Live]",
    expect.stringContaining("transcription: waiting for session HTTP response"),
  );
  expect(fixture.input.stop).toHaveBeenCalledOnce();
});

test("both connection timeout and unconfirmed closure remain bounded without retry", async () => {
  vi.useFakeTimers();
  const timedOut = setup();
  await timedOut.conversation.start();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(timedOut.onState.mock.lastCall?.[0].phase).toBe("error");
  expect(timedOut.onState.mock.lastCall?.[0].message).toContain("timed out");
  expect(timedOut.fetch).toHaveBeenCalledTimes(2);
  const fixture = setup();
  await connect(fixture);
  const stop = fixture.conversation.stop();
  await vi.advanceTimersByTimeAsync(2_000);
  await stop;
  expect(fixture.onState.mock.lastCall?.[0].message).toContain("not confirmed");
  expect(fixture.fetch).toHaveBeenCalledTimes(2);
});

test("microphone loss shuts both transports and does not expose provider error text", async () => {
  const fixture = setup();
  await connect(fixture);
  fixture.input.dispatchEvent(new Event("ended"));
  fixture.emit(0, { type: "error", error: { message: "secret" } });
  expect(fixture.audio.muted).toBe(true);
  fixture.emit(0, { type: "session.closed" });
  expect(fixture.onState.mock.lastCall?.[0].phase).toBe("error");
  expect(fixture.onState.mock.lastCall?.[0].message).toContain(
    "Microphone disconnected",
  );
  expect(fixture.onState.mock.lastCall?.[0].message).not.toContain("secret");
  expect(fixture.getUserMedia).toHaveBeenCalledOnce();
});

test("telemetry shows activity but silence and late samples never settle or revive speech", async () => {
  vi.useFakeTimers();
  const fixture = setup();
  const getStats = vi.fn(
    async (): Promise<Map<string, unknown>> =>
      new Map([
        ["input", { type: "media-source", kind: "audio", audioLevel: 0.24 }],
        ["output", { type: "inbound-rtp", kind: "audio", audioLevel: 0.2 }],
      ]),
  );
  Object.assign(fixture.peers[0]!, { getStats });
  await connect(fixture);
  fixture.peers[0]!.dispatchEvent(
    Object.assign(new Event("track"), {
      track: fixture.outputs[0],
      streams: [fixture.stream],
    }),
  );
  fixture.conversation.setSpeakerMuted(true);
  fixture.conversation.setSpeakerVolume(0);
  await vi.advanceTimersByTimeAsync(100);
  expect(fixture.onState.mock.lastCall?.[0].activity).toEqual({
    microphoneLevel: 0.24,
    outputActive: true,
  });
  getStats.mockResolvedValue(new Map());
  await vi.advanceTimersByTimeAsync(400);
  expect(fixture.onState.mock.lastCall?.[0].activity?.outputActive).toBe(true);
  await vi.advanceTimersByTimeAsync(99);
  expect(fixture.onState.mock.lastCall?.[0].activity?.outputActive).toBe(true);
  await vi.advanceTimersByTimeAsync(1);
  expect(fixture.onState.mock.lastCall?.[0].activity?.outputActive).toBe(false);
  expect(fixture.onFinalizedInput).not.toHaveBeenCalled();
  getStats.mockRejectedValueOnce(new Error("Stats unavailable"));
  await vi.advanceTimersByTimeAsync(100);
  expect(fixture.input.stop).not.toHaveBeenCalled();
  getStats.mockResolvedValueOnce(
    new Map([
      ["output", { type: "inbound-rtp", kind: "audio", audioLevel: 0.2 }],
    ]),
  );
  await vi.advanceTimersByTimeAsync(100);
  await vi.advanceTimersByTimeAsync(300);
  expect(fixture.onState.mock.lastCall?.[0].activity?.outputActive).toBe(true);
  let release = (_stats: Map<string, unknown>) => {};
  getStats.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await vi.advanceTimersByTimeAsync(100);
  await vi.advanceTimersByTimeAsync(99);
  const stop = fixture.conversation.stop();
  expect(fixture.audio.muted).toBe(true);
  expect(fixture.audio.pause).toHaveBeenCalledOnce();
  expect(fixture.input.stop).toHaveBeenCalledOnce();
  expect(fixture.onState.mock.lastCall?.[0].phase).toBe("stopping");
  fixture.emit(0, { type: "session.closed" });
  await stop;
  const calls = fixture.onState.mock.calls.length;
  release(new Map());
  await vi.advanceTimersByTimeAsync(500);
  expect(fixture.onState).toHaveBeenCalledTimes(calls);
});

test("progress commentary has a null delegation and only the later wrap-up closes the local delegation", async () => {
  const fixture = setup();
  await connect(fixture);
  fixture.emit(0, {
    type: "session.delegation.created",
    delegation: { id: "opaque", target: "client" },
  });
  fixture.conversation.appendCommentary("Give me a moment on this one.", null);
  const progress = fixture.onAppendResult.mock.lastCall![0];
  expect(JSON.parse(fixture.sent[0][0]!)).toMatchObject({
    type: "session.commentary.append",
    delegation_id: null,
    content: "Give me a moment on this one.",
  });
  fixture.emit(0, {
    type: "session.commentary.appended",
    client_event_id: progress.eventId,
    start_ms: 1_000,
  });
  expect(fixture.conversation.openDelegations.has("opaque")).toBe(true);
  fixture.conversation.appendCommentary("The model is ready.", "opaque");
  const wrapUp = fixture.onAppendResult.mock.lastCall![0];
  fixture.emit(0, {
    type: "session.commentary.appended",
    client_event_id: wrapUp.eventId,
    start_ms: 2_000,
  });
  expect(fixture.conversation.openDelegations.has("opaque")).toBe(false);
});

test("quiet interruption context requires its own acknowledgement and leaves the delegation open", async () => {
  const fixture = setup();
  await connect(fixture);
  fixture.emit(0, {
    type: "session.delegation.created",
    delegation: { id: "opaque", target: "client" },
  });
  expect(
    fixture.conversation.appendThinking(
      "The previous answer was interrupted.",
      null,
    ),
  ).toBe(true);
  const pending = fixture.onAppendResult.mock.lastCall![0];
  expect(pending).toMatchObject({
    kind: "thinking",
    delegationId: null,
    status: "unknown",
  });
  expect(JSON.parse(fixture.sent[0][0]!)).toEqual({
    type: "session.thinking.append",
    event_id: pending.eventId,
    delegation_id: null,
    content: "The previous answer was interrupted.",
  });
  fixture.emit(0, {
    type: "session.commentary.appended",
    client_event_id: pending.eventId,
  });
  expect(fixture.onAppendResult).toHaveBeenCalledOnce();
  fixture.emit(0, {
    type: "session.thinking.appended",
    client_event_id: pending.eventId,
  });
  expect(fixture.onAppendResult.mock.lastCall![0]).toEqual({
    ...pending,
    status: "accepted",
  });
  expect(
    fixture.conversation.appendThinking("Wait for a new request.", "opaque"),
  ).toBe(true);
  const context = fixture.onAppendResult.mock.lastCall![0];
  fixture.emit(0, {
    type: "session.thinking.appended",
    client_event_id: context.eventId,
  });
  expect(fixture.onAppendResult.mock.lastCall![0].status).toBe("accepted");
  expect(fixture.conversation.openDelegations.has("opaque")).toBe(true);
});

test("records the microphone processing the browser applied at start and after a switch", async () => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const settings = new VoiceAudioSettings("live", undefined);
  const attach = vi.spyOn(settings, "attach");
  const fixture = setup({ audioSettings: settings });
  Object.assign(fixture.input, {
    getSettings: () => ({
      autoGainControl: true,
      deviceId: "PRIVATE-DEVICE",
      echoCancellation: true,
      noiseSuppression: true,
    }),
  });
  await connect(fixture);
  const replacement = {
    enabled: true,
    stop: vi.fn(),
    getSettings: () => ({
      echoCancellation: "remote-only",
      noiseSuppression: false,
    }),
  };
  const connection = attach.mock.calls[0]?.[0];
  connection?.replaceMicrophone({
    getAudioTracks: () => [replacement],
    getTracks: () => [replacement],
  } as unknown as MediaStream);

  expect(traceRecords(debug.mock.calls, "capture.settings")).toEqual([
    expect.objectContaining({
      reason: "started",
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }),
    expect.objectContaining({
      reason: "microphone-switched",
      echoCancellation: "remote-only",
      noiseSuppression: false,
    }),
  ]);
  expect(JSON.stringify(debug.mock.calls)).not.toContain("PRIVATE");
  const stopped = fixture.conversation.stop();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
});

test("summarises echo evidence for each stretch of audible Live output without provider text", async () => {
  vi.useFakeTimers();
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const fixture = setup();
  const getStats = vi.fn(
    async (): Promise<Map<string, unknown>> =>
      new Map([
        [
          "input",
          {
            type: "media-source",
            kind: "audio",
            audioLevel: 0.05,
            echoReturnLoss: 10,
            echoReturnLossEnhancement: 30,
          },
        ],
        ["output", { type: "inbound-rtp", kind: "audio", audioLevel: 0.2 }],
      ]),
  );
  Object.assign(fixture.peers[0]!, { getStats });
  await connect(fixture);
  fixture.peers[0]!.dispatchEvent(
    Object.assign(new Event("track"), {
      track: fixture.outputs[0],
      streams: [fixture.stream],
    }),
  );
  fixture.emit(0, {
    type: "session.output_transcript.delta",
    delta: "PRIVATE ANSWER",
    start_ms: 5_000,
    end_ms: 5_400,
  });
  await vi.advanceTimersByTimeAsync(100);
  // A late fragment of the person's request, then the answer heard back.
  fixture.emit(0, {
    type: "session.input_transcript.delta",
    delta: "PRIVATE REQUEST",
    start_ms: 4_600,
    end_ms: 4_900,
  });
  fixture.emit(0, {
    type: "session.input_transcript.delta",
    delta: "PRIVATE ECHO",
    start_ms: 5_200,
    end_ms: 5_500,
  });
  fixture.emit(1, {
    type: "input_audio_buffer.speech_started",
    item_id: "during-output",
    audio_start_ms: 900,
  });
  getStats.mockResolvedValue(
    new Map([
      [
        "input",
        {
          type: "media-source",
          kind: "audio",
          audioLevel: 0.12,
          echoReturnLoss: 20,
        },
      ],
      ["output", { type: "inbound-rtp", kind: "audio", audioLevel: 0.2 }],
    ]),
  );
  await vi.advanceTimersByTimeAsync(100);
  getStats.mockResolvedValue(
    new Map([
      ["input", { type: "media-source", kind: "audio", audioLevel: 0.01 }],
    ]),
  );
  await vi.advanceTimersByTimeAsync(900);
  expect(traceRecords(debug.mock.calls, "echo.output")).toEqual([]);
  await vi.advanceTimersByTimeAsync(100);

  expect(traceRecords(debug.mock.calls, "echo.output")).toEqual([
    expect.objectContaining({
      sessionEnded: false,
      outputMs: 100,
      microphoneMuted: false,
      selectedSpeaker: false,
      peakMicrophoneLevel: 0.12,
      echoReturnLossSamples: 2,
      echoReturnLossDb: 15,
      echoReturnLossEnhancementSamples: 1,
      echoReturnLossEnhancementDb: 30,
      transcriptionSpeechStarts: 1,
      liveOutputFragments: 1,
      liveInputFragments: 1,
    }),
  ]);
  fixture.emit(1, {
    type: "input_audio_buffer.speech_started",
    item_id: "after-output",
  });
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "during-output",
    previous_item_id: null,
  });
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "after-output",
    previous_item_id: "during-output",
  });
  for (const itemId of ["during-output", "after-output"]) {
    fixture.emit(1, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: itemId,
      content_index: 0,
      transcript: "PRIVATE TRANSCRIPT",
    });
  }
  const finalized = traceRecords(debug.mock.calls, "input.finalized");
  expect(finalized).toEqual([
    expect.objectContaining({
      itemId: "during-output",
      startedDuringOutput: true,
      sinceOutputMs: 0,
    }),
    expect.objectContaining({
      itemId: "after-output",
      startedDuringOutput: false,
    }),
  ]);
  expect(finalized[1]).not.toHaveProperty("sinceOutputMs");
  expect(
    fixture.onFinalizedInput.mock.calls.map(
      ([input]) => input.startedDuringOutput,
    ),
  ).toEqual([true, false]);
  expect(JSON.stringify(debug.mock.calls)).not.toContain("PRIVATE");
  const stopped = fixture.conversation.stop();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
});

test("records transcription confidence on input.finalized from numbers only", async () => {
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const fixture = setup();
  await connect(fixture);
  const items: readonly (readonly [string, unknown])[] = [
    [
      "scored",
      [
        { token: "PRIVATE", logprob: -0.1, bytes: [80] },
        { token: " hmm", logprob: -1.9004, bytes: [32, 104] },
        { token: ".", logprob: -0.0004, bytes: [46] },
      ],
    ],
    ["unscored", undefined],
    ["malformed", [{ token: "PRIVATE", logprob: "low" }, null]],
  ];
  let previous: string | null = null;
  for (const [itemId] of items) {
    fixture.emit(1, {
      type: "input_audio_buffer.committed",
      item_id: itemId,
      previous_item_id: previous,
    });
    previous = itemId;
  }
  for (const [itemId, logprobs] of items) {
    fixture.emit(1, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: itemId,
      content_index: 0,
      transcript: "PRIVATE hmm.",
      ...(logprobs === undefined ? {} : { logprobs }),
    });
  }

  const finalized = traceRecords(debug.mock.calls, "input.finalized");
  expect(finalized).toEqual([
    expect.objectContaining({
      itemId: "scored",
      logprobTokens: 3,
      meanLogprob: -0.667,
      minLogprob: -1.9,
    }),
    expect.objectContaining({ itemId: "unscored", logprobTokens: 0 }),
    expect.objectContaining({ itemId: "malformed", logprobTokens: 0 }),
  ]);
  expect(finalized[1]).not.toHaveProperty("meanLogprob");
  expect(finalized[2]).not.toHaveProperty("minLogprob");
  expect(
    fixture.onFinalizedInput.mock.calls.map(([input]) => Object.keys(input)),
  ).toEqual([
    ["id", "text", "transcriptionPrompt", "startedDuringOutput", "minLogprob"],
    ["id", "text", "transcriptionPrompt", "startedDuringOutput"],
    ["id", "text", "transcriptionPrompt", "startedDuringOutput"],
  ]);
  expect(fixture.onFinalizedInput.mock.calls[0]?.[0].minLogprob).toBe(-1.9004);
  const traced = JSON.stringify(debug.mock.calls);
  expect(traced).not.toContain("PRIVATE");
  expect(traced).not.toContain("hmm");
  const stopped = fixture.conversation.stop();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
});

test("records each utterance's peak microphone level on input.finalized", async () => {
  vi.useFakeTimers();
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const fixture = setup();
  let microphoneLevel = 0.3;
  Object.assign(fixture.peers[0]!, {
    getStats: vi.fn(
      async (): Promise<Map<string, unknown>> =>
        new Map([
          [
            "input",
            {
              type: "media-source",
              kind: "audio",
              audioLevel: microphoneLevel,
            },
          ],
        ]),
    ),
  });
  await connect(fixture);
  await vi.advanceTimersByTimeAsync(100);
  fixture.emit(1, {
    type: "input_audio_buffer.speech_started",
    item_id: "answer",
  });
  microphoneLevel = 0.5;
  await vi.advanceTimersByTimeAsync(100);
  fixture.emit(1, {
    type: "input_audio_buffer.speech_stopped",
    item_id: "answer",
  });
  microphoneLevel = 0.9;
  await vi.advanceTimersByTimeAsync(100);
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "answer",
    previous_item_id: null,
  });
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "answer",
    content_index: 0,
    transcript: "PRIVATE",
  });

  expect(traceRecords(debug.mock.calls, "input.finalized")).toEqual([
    expect.objectContaining({ itemId: "answer", peakMicrophoneLevel: 0.5 }),
  ]);
  expect(JSON.stringify(debug.mock.calls)).not.toContain("PRIVATE");
  const stopped = fixture.conversation.stop();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
});

test("flushes an unfinished output summary, with its mute state, when voice ends", async () => {
  vi.useFakeTimers();
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const fixture = setup();
  Object.assign(fixture.peers[0]!, {
    getStats: vi.fn(
      async (): Promise<Map<string, unknown>> =>
        new Map([
          ["output", { type: "inbound-rtp", kind: "audio", audioLevel: 0.2 }],
        ]),
    ),
  });
  await connect(fixture);
  fixture.peers[0]!.dispatchEvent(
    Object.assign(new Event("track"), {
      track: fixture.outputs[0],
      streams: [fixture.stream],
    }),
  );
  await vi.advanceTimersByTimeAsync(100);
  fixture.conversation.setMicrophoneMuted(true);
  fixture.conversation.setSpeakerMuted(true);
  await vi.advanceTimersByTimeAsync(100);
  const stopped = fixture.conversation.stop();
  fixture.emit(0, { type: "session.closed" });
  await stopped;

  const summaries = traceRecords(debug.mock.calls, "echo.output");
  expect(summaries).toEqual([
    expect.objectContaining({
      sessionEnded: true,
      outputMs: 0,
      microphoneMuted: true,
      echoReturnLossSamples: 0,
      echoReturnLossEnhancementSamples: 0,
    }),
  ]);
  expect(summaries[0]).not.toHaveProperty("echoReturnLossDb");
});

test("passes Live's recent words only with speech that overlapped its audible output", async () => {
  vi.useFakeTimers();
  vi.stubEnv("DEV", true);
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const fixture = setup();
  let outputLevel = 0;
  Object.assign(fixture.peers[0]!, {
    getStats: vi.fn(
      async (): Promise<Map<string, unknown>> =>
        new Map([
          [
            "output",
            { type: "inbound-rtp", kind: "audio", audioLevel: outputLevel },
          ],
        ]),
    ),
  });
  await connect(fixture);
  fixture.peers[0]!.dispatchEvent(
    Object.assign(new Event("track"), {
      track: fixture.outputs[0],
      streams: [fixture.stream],
    }),
  );
  const liveWords = (delta: string) =>
    fixture.emit(0, { type: "session.output_transcript.delta", delta });
  const speech = (type: "started" | "stopped", itemId: string) =>
    fixture.emit(1, {
      type: `input_audio_buffer.speech_${type}`,
      item_id: itemId,
    });

  liveWords("PRIVATE STALE ");
  await vi.advanceTimersByTimeAsync(3_500);
  speech("started", "early");
  await vi.advanceTimersByTimeAsync(1_000);
  liveWords("PRIVATE ANSWER");
  outputLevel = 0.2;
  await vi.advanceTimersByTimeAsync(500);
  speech("stopped", "early");
  outputLevel = 0;
  await vi.advanceTimersByTimeAsync(2_000);
  speech("started", "late");
  await vi.advanceTimersByTimeAsync(500);
  speech("stopped", "late");
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "early",
    previous_item_id: null,
  });
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "late",
    previous_item_id: "early",
  });
  for (const itemId of ["early", "late"]) {
    fixture.emit(1, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: itemId,
      content_index: 0,
      transcript: `PRIVATE ${itemId}`,
    });
  }

  expect(
    fixture.onFinalizedInput.mock.calls.map(([input]) => [
      input.text,
      input.liveOutputText,
    ]),
  ).toEqual([
    ["PRIVATE early", "PRIVATE ANSWER"],
    ["PRIVATE late", undefined],
  ]);
  expect(
    fixture.onFinalizedInput.mock.calls.map(([input]) => Object.keys(input)),
  ).toEqual([
    [
      "id",
      "text",
      "transcriptionPrompt",
      "superseded",
      "startedDuringOutput",
      "liveOutputText",
    ],
    ["id", "text", "transcriptionPrompt", "startedDuringOutput"],
  ]);
  expect(traceRecords(debug.mock.calls, "input.finalized")).toEqual([
    expect.objectContaining({ itemId: "early", overlappedOutput: true }),
    expect.objectContaining({ itemId: "late", overlappedOutput: false }),
  ]);
  expect(JSON.stringify(debug.mock.calls)).not.toContain("PRIVATE");
  const stopped = fixture.conversation.stop();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
});

test("does not count speech as started during or overlapping output while the speaker is muted or at zero volume", async () => {
  vi.useFakeTimers();
  const fixture = setup();
  Object.assign(fixture.peers[0]!, {
    getStats: vi.fn(
      async (): Promise<Map<string, unknown>> =>
        new Map([
          ["output", { type: "inbound-rtp", kind: "audio", audioLevel: 0.2 }],
        ]),
    ),
  });
  await connect(fixture);
  fixture.peers[0]!.dispatchEvent(
    Object.assign(new Event("track"), {
      track: fixture.outputs[0],
      streams: [fixture.stream],
    }),
  );
  fixture.emit(0, {
    type: "session.output_transcript.delta",
    delta: "Yes.",
  });
  const speakers = [
    { itemId: "muted", muted: true, volume: 1 },
    { itemId: "silent", muted: false, volume: 0 },
    { itemId: "audible", muted: false, volume: 1 },
  ];
  for (const { itemId, muted, volume } of speakers) {
    fixture.conversation.setSpeakerMuted(muted);
    fixture.conversation.setSpeakerVolume(volume);
    await vi.advanceTimersByTimeAsync(100);
    for (const type of ["started", "stopped"]) {
      fixture.emit(1, {
        type: `input_audio_buffer.speech_${type}`,
        item_id: itemId,
      });
    }
  }
  let previousItemId: string | null = null;
  for (const { itemId } of speakers) {
    fixture.emit(1, {
      type: "input_audio_buffer.committed",
      item_id: itemId,
      previous_item_id: previousItemId,
    });
    previousItemId = itemId;
  }
  for (const { itemId } of speakers) {
    fixture.emit(1, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: itemId,
      content_index: 0,
      transcript: "Yes.",
    });
  }

  expect(
    fixture.onFinalizedInput.mock.calls.map(
      ([input]) => input.startedDuringOutput,
    ),
  ).toEqual([false, false, true]);
  expect(
    fixture.onFinalizedInput.mock.calls.map(([input]) => input.liveOutputText),
  ).toEqual([undefined, undefined, "Yes."]);
  const stopped = fixture.conversation.stop();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
});

test("reports speech as pending from its start until its transcript is finalized", async () => {
  const fixture = setup();
  await connect(fixture);
  const pendingAtFinalize: boolean[] = [];
  fixture.onFinalizedInput.mockImplementation(() => {
    pendingAtFinalize.push(fixture.conversation.speechPending());
  });
  const speechStarted = (itemId: string) =>
    fixture.emit(1, {
      type: "input_audio_buffer.speech_started",
      item_id: itemId,
    });
  const finalize = (itemId: string, previousItemId: string | null) => {
    fixture.emit(1, {
      type: "input_audio_buffer.committed",
      item_id: itemId,
      previous_item_id: previousItemId,
    });
    fixture.emit(1, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: itemId,
      content_index: 0,
      transcript: "Yes.",
    });
  };

  expect(fixture.conversation.speechPending()).toBe(false);
  speechStarted("one");
  expect(fixture.conversation.speechPending()).toBe(true);
  speechStarted("two");
  finalize("one", null);
  expect(pendingAtFinalize).toEqual([true]);
  finalize("two", "one");
  expect(pendingAtFinalize).toEqual([true, false]);
  expect(fixture.conversation.speechPending()).toBe(false);

  speechStarted("three");
  const stopped = fixture.conversation.stop();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
  expect(fixture.conversation.speechPending()).toBe(false);
});
