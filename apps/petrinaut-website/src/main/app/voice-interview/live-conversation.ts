export interface LiveConversationState {
  readonly phase:
    | "idle"
    | "connecting"
    | "connected"
    | "stopping"
    | "ended"
    | "error";
  readonly message: string | null;
  /** Local media activity for the dock, never a turn or playback-completion signal. */
  readonly activity?: {
    readonly microphoneLevel: number;
    readonly outputActive: boolean;
  };
}

interface FinalizedInput {
  readonly id: string;
  readonly text: string;
}

type ConnectionKind = "live" | "transcription";

/** One disposable Live plus transcription session sharing one consented capture. */
export const createLiveConversation = (
  onState: (state: LiveConversationState) => void,
  connectionTimeoutMs: number,
  onFinalizedInput: (input: FinalizedInput) => void,
) => {
  const abort = new AbortController();
  const sessionId = crypto.randomUUID();
  const peers = new Map<ConnectionKind, RTCPeerConnection>();
  const channels = new Map<ConnectionKind, RTCDataChannel>();
  const ready = new Set<ConnectionKind>();
  const connectionStages = new Map<ConnectionKind, string>();
  const connectionProgress = () =>
    connectionStages.size === 0
      ? "waiting for microphone access"
      : [...connectionStages]
          .filter(([kind]) => !ready.has(kind))
          .map(([kind, stage]) => `${kind}: ${stage}`)
          .join("; ");
  const committedPrevious = new Map<string, string | null>();
  const completed = new Map<string, FinalizedInput>();
  const emitted = new Set<string>();
  let microphone: MediaStream | undefined;
  let audio: HTMLAudioElement | undefined;
  let started = false;
  let stopping = false;
  let finished = false;
  let liveCreationRequested = false;
  let failure: string | undefined;
  let connectionTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let activityTimer: ReturnType<typeof setTimeout> | undefined;
  let lastOutputActivity = -Infinity;
  let lastActivity: LiveConversationState["activity"];
  let resolveStopped: () => void = () => {};
  const stopped = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });

  const stopMedia = () => {
    clearTimeout(activityTimer);
    microphone?.getTracks().forEach((track) => track.stop());
    if (audio) {
      audio.muted = true;
      audio.pause();
      audio.srcObject = null;
    }
    peers.forEach((peer) =>
      peer.getReceivers().forEach((receiver) => receiver.track.stop()),
    );
  };

  const finish = (liveConfirmed: boolean) => {
    if (finished) return;
    finished = true;
    stopping = true;
    clearTimeout(connectionTimer);
    clearTimeout(closeTimer);
    abort.abort();
    stopMedia();
    channels.forEach((channel) => channel.close());
    peers.forEach((peer) => peer.close());
    const closure = liveConfirmed
      ? "Live confirmed session closure."
      : liveCreationRequested
        ? "Remote Live session closure was not confirmed."
        : "No Live provider session was requested.";
    onState({
      phase: failure ? "error" : "ended",
      message: `${failure ? `${failure} ` : ""}Microphone and playback stopped. ${closure}`,
    });
    resolveStopped();
  };

  const stop = (): Promise<void> => {
    if (stopping) return stopped;
    stopping = true;
    clearTimeout(connectionTimer);
    abort.abort();
    stopMedia();
    channels.get("transcription")?.close();
    peers.get("transcription")?.close();
    onState({
      phase: "stopping",
      message: `${failure ? `${failure} ` : ""}Microphone and playback stopped. Closing Live…`,
    });
    const liveChannel = channels.get("live");
    if (liveChannel?.readyState === "open" && ready.has("live")) {
      closeTimer = setTimeout(() => finish(false), 2_000);
      try {
        liveChannel.send(JSON.stringify({ type: "session.close" }));
      } catch {
        finish(false);
      }
    } else {
      finish(false);
    }
    return stopped;
  };

  const fail = (message: string) => {
    if (stopping) return;
    // Only application-authored errors reach this function, never raw provider
    // events, SDP, credentials or transcripts. Preserve the first failure even
    // when the panel is collapsed or no longer showing the consent card.
    // oxlint-disable-next-line no-console -- local connection diagnostics for the manual experiment.
    console.warn("[Petrinaut Live]", message);
    failure = message;
    if (ready.has("live")) void stop();
    else finish(false);
  };

  const sampleActivity = async () => {
    const livePeer = peers.get("live");
    if (stopping || !livePeer) return;
    let microphoneLevel = 0;
    let outputLevel = 0;
    try {
      const stats = await livePeer.getStats();
      stats.forEach((report: unknown) => {
        if (
          typeof report !== "object" ||
          report === null ||
          !("kind" in report) ||
          report.kind !== "audio" ||
          !("audioLevel" in report) ||
          typeof report.audioLevel !== "number" ||
          !("type" in report)
        )
          return;
        if (report.type === "media-source") microphoneLevel = report.audioLevel;
        if (report.type === "inbound-rtp") outputLevel = report.audioLevel;
      });
    } catch {
      // Optional telemetry must not affect the session lifetime.
    }
    if (abort.signal.aborted) return;
    const playing = audio?.srcObject && !audio.paused && !audio.muted;
    if (playing && outputLevel > 0.01) lastOutputActivity = Date.now();
    const activity = {
      microphoneLevel: Math.round(microphoneLevel * 100) / 100,
      outputActive: Boolean(playing) && Date.now() - lastOutputActivity < 300,
    };
    if (
      !lastActivity ||
      activity.microphoneLevel !== lastActivity.microphoneLevel ||
      activity.outputActive !== lastActivity.outputActive
    ) {
      lastActivity = activity;
      onState({ phase: "connected", message: null, activity });
    }
    activityTimer = setTimeout(() => void sampleActivity(), 100);
  };

  const committedAfter = (previousItemId: string) =>
    [...committedPrevious].find(
      ([, previous]) => previous === previousItemId,
    )?.[0];

  const flushFinalizedInputs = () => {
    if (stopping || ready.size !== 2) return;
    const roots = [...committedPrevious].filter(
      ([, previous]) => previous === null,
    );
    if (roots.length > 1) {
      fail(
        "Transcription item ordering conflicted. No automatic retry was made.",
      );
      return;
    }
    let itemId = roots[0]?.[0];
    while (itemId && !abort.signal.aborted) {
      const input = completed.get(itemId);
      if (!input) return;
      if (!emitted.has(input.id)) {
        emitted.add(input.id);
        onFinalizedInput(input);
      }
      itemId = committedAfter(itemId);
    }
  };

  const markReady = (kind: ConnectionKind) => {
    ready.add(kind);
    if (ready.size !== 2) return;
    clearTimeout(connectionTimer);
    onState({ phase: "connected", message: null });
    activityTimer = setTimeout(() => void sampleActivity(), 100);
    flushFinalizedInputs();
  };

  const handleTranscriptionEvent = (data: Record<string, unknown>) => {
    if (data.type === "session.created" || data.type === "session.updated") {
      if (!ready.has("transcription")) markReady("transcription");
      return;
    }
    if (data.type === "input_audio_buffer.committed") {
      if (
        typeof data.item_id !== "string" ||
        !(
          data.previous_item_id === null ||
          typeof data.previous_item_id === "string"
        )
      ) {
        fail("Transcription sent an invalid committed item.");
        return;
      }
      const previous = committedPrevious.get(data.item_id);
      const conflictingSuccessor = [...committedPrevious].some(
        ([id, predecessor]) =>
          id !== data.item_id && predecessor === data.previous_item_id,
      );
      let ancestor: string | null | undefined = data.previous_item_id;
      const ancestors = new Set([data.item_id]);
      while (
        ancestor !== null &&
        ancestor !== undefined &&
        !ancestors.has(ancestor)
      ) {
        ancestors.add(ancestor);
        ancestor = committedPrevious.get(ancestor);
      }
      if (
        (previous !== undefined && previous !== data.previous_item_id) ||
        conflictingSuccessor ||
        (ancestor !== null && ancestor !== undefined)
      ) {
        fail(
          "Transcription item ordering conflicted. No automatic retry was made.",
        );
        return;
      }
      committedPrevious.set(data.item_id, data.previous_item_id);
      flushFinalizedInputs();
      return;
    }
    if (data.type === "conversation.item.input_audio_transcription.completed") {
      if (
        typeof data.item_id !== "string" ||
        data.content_index !== 0 ||
        typeof data.transcript !== "string"
      ) {
        fail("Transcription sent an invalid completed item.");
        return;
      }
      const input = {
        id: `voice-live:${sessionId}:${encodeURIComponent(data.item_id)}:${data.content_index}`,
        text: data.transcript,
      };
      const existing = completed.get(data.item_id);
      if (
        existing &&
        (existing.id !== input.id || existing.text !== input.text)
      ) {
        fail("Transcription identity conflicted. No automatic retry was made.");
        return;
      }
      completed.set(data.item_id, input);
      flushFinalizedInputs();
      return;
    }
    if (
      data.type === "conversation.item.input_audio_transcription.failed" ||
      data.type === "error" ||
      data.type === "session.error"
    )
      fail("Transcription failed. No fallback or automatic retry was made.");
  };

  const parseEvent = (kind: ConnectionKind, event: MessageEvent<string>) => {
    if (finished) return;
    let data: unknown;
    try {
      data = JSON.parse(event.data);
    } catch {
      fail(
        `${kind === "live" ? "Live" : "Transcription"} sent an unreadable event.`,
      );
      return;
    }
    if (typeof data !== "object" || data === null || !("type" in data)) return;
    if (stopping && !(kind === "live" && data.type === "session.closed"))
      return;
    if (kind === "transcription") {
      handleTranscriptionEvent(data as Record<string, unknown>);
      return;
    }
    if (data.type === "session.closed") {
      finish(true);
    } else if (
      !stopping &&
      data.type === "session.started" &&
      !ready.has("live")
    ) {
      markReady("live");
    } else if (
      !stopping &&
      (data.type === "error" || data.type === "session.error")
    ) {
      fail("Live reported an error. No automatic retry was made.");
    }
  };

  const createConnection = async (
    kind: ConnectionKind,
    stream: MediaStream,
  ) => {
    abort.signal.throwIfAborted();
    connectionStages.set(kind, "creating local WebRTC offer");
    const connection = new RTCPeerConnection();
    peers.set(kind, connection);
    const channel = connection.createDataChannel("oai-events");
    channels.set(kind, channel);
    channel.addEventListener("message", (event: MessageEvent<string>) =>
      parseEvent(kind, event),
    );
    channel.addEventListener("close", () => {
      if (!stopping)
        fail(`${kind === "live" ? "Live" : "Transcription"} disconnected.`);
    });
    channel.addEventListener("error", () =>
      fail(
        `${kind === "live" ? "Live" : "Transcription"} data connection failed.`,
      ),
    );
    connection.addEventListener("connectionstatechange", () => {
      if (
        ["failed", "disconnected", "closed"].includes(
          connection.connectionState,
        )
      )
        fail(
          `${kind === "live" ? "Live" : "Transcription"} media connection ended.`,
        );
    });
    if (kind === "live") {
      connection.addEventListener("track", (event) => {
        if (stopping) {
          event.track.stop();
          return;
        }
        if (!audio) return;
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void audio
          .play()
          .catch(() =>
            fail(
              "Browser blocked Live playback. Start a new session after checking audio permissions.",
            ),
          );
      });
    }
    stream.getTracks().forEach((track) => connection.addTrack(track, stream));
    await connection.setLocalDescription(await connection.createOffer());
    abort.signal.throwIfAborted();
    connectionStages.set(kind, "gathering ICE candidates");
    if (connection.iceGatheringState !== "complete") {
      await new Promise<void>((resolve, reject) => {
        const check = () => {
          if (connection.iceGatheringState === "complete") resolve();
        };
        connection.addEventListener("icegatheringstatechange", check, {
          signal: abort.signal,
        });
        abort.signal.addEventListener(
          "abort",
          () => reject(abort.signal.reason),
          {
            once: true,
          },
        );
        check();
      });
    }
    abort.signal.throwIfAborted();
    const sdp = connection.localDescription?.sdp;
    if (!sdp) throw new Error("Missing local SDP");
    if (kind === "live") liveCreationRequested = true;
    connectionStages.set(kind, "waiting for session HTTP response");
    const response = await fetch(`/api/voice/${kind}-session`, {
      method: "POST",
      headers: { "content-type": "application/sdp" },
      body: sdp,
      signal: abort.signal,
    });
    if (!response.ok) {
      // Only expose numeric status metadata, never provider text, credentials or SDP.
      const upstreamStatus = response.headers.get("x-voice-upstream-status");
      const providerStatus =
        upstreamStatus && /^[45]\d{2}$/u.test(upstreamStatus)
          ? `, provider HTTP ${upstreamStatus}`
          : "";
      fail(
        `${kind} session request failed (HTTP ${response.status}${providerStatus}). No automatic retry was made.`,
      );
      throw new Error("Session creation failed");
    }
    connectionStages.set(kind, "reading session HTTP response");
    const answer: unknown = await response.json();
    abort.signal.throwIfAborted();
    if (
      typeof answer !== "object" ||
      answer === null ||
      !("sdp" in answer) ||
      typeof answer.sdp !== "string" ||
      !answer.sdp.trimStart().startsWith("v=0")
    )
      throw new Error("Invalid SDP answer");
    connectionStages.set(kind, "applying remote SDP answer");
    await connection.setRemoteDescription({ type: "answer", sdp: answer.sdp });
    connectionStages.set(
      kind,
      kind === "live"
        ? "waiting for session.started"
        : "waiting for session.created",
    );
  };

  const start = async (): Promise<void> => {
    if (started || stopping) return;
    started = true;
    onState({ phase: "connecting", message: null });
    connectionTimer = setTimeout(
      () =>
        fail(
          `Voice connections timed out (${connectionProgress()}). No automatic retry was made.`,
        ),
      connectionTimeoutMs,
    );
    try {
      audio = new Audio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (abort.signal.aborted) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      microphone = stream;
      stream.getTracks().forEach((track) =>
        track.addEventListener(
          "ended",
          () => fail("Microphone disconnected."),
          {
            signal: abort.signal,
          },
        ),
      );
      await Promise.all([
        createConnection("live", stream),
        createConnection("transcription", stream),
      ]);
    } catch {
      fail(
        `Voice could not connect (${connectionProgress()}). No automatic retry was made.`,
      );
    }
  };

  const appendCommentary = (text: string): boolean => {
    const liveChannel = channels.get("live");
    if (
      stopping ||
      ready.size !== 2 ||
      liveChannel?.readyState !== "open" ||
      !text.trim() ||
      // UTF-8 byte length is a conservative upper bound on text BPE tokens.
      // Never split or truncate a frozen source to fit the 500-token API cap.
      new TextEncoder().encode(text).byteLength > 500
    )
      return false;
    try {
      liveChannel.send(
        JSON.stringify({
          type: "session.commentary.append",
          event_id: crypto.randomUUID(),
          delegation_id: null,
          content: text,
        }),
      );
      return true;
    } catch {
      return false;
    }
  };

  return { start, stop, appendCommentary };
};
