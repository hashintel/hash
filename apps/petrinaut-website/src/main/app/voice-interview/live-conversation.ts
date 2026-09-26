import { voicePreferenceHeader } from "../../../shared/voice-settings";
import {
  createOutputEchoTrace,
  logCaptureSettings,
} from "./live-conversation/echo-diagnostics";
import { logLiveDiagnostic } from "./shared/live-diagnostic";

import type { VoiceAudioSettings } from "./voice-audio-settings";

export interface LiveConversationState {
  readonly phase:
    | "idle"
    | "connecting"
    | "connected"
    | "stopping"
    | "ended"
    | "error";
  readonly message: string | null;
  readonly playbackBlocked?: boolean;
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

export interface LiveAppendResult {
  readonly eventId: string;
  readonly kind: "commentary" | "instructions";
  readonly delegationId: string | null;
  /** Unknown means sent locally, but provider acceptance is not yet confirmed. */
  readonly status: "local-failure" | "unknown" | "accepted" | "rejected";
}

/** One disposable Live plus transcription session sharing one consented capture. */
export const createLiveConversation = (
  onState: (state: LiveConversationState) => void,
  connectionTimeoutMs: number,
  onFinalizedInput: (input: FinalizedInput) => void,
  onDelegation: (delegationId: string) => void,
  onAppendResult: (result: LiveAppendResult) => void,
  audioSettings?: VoiceAudioSettings,
) => {
  const abort = new AbortController();
  const sessionId = crypto.randomUUID();
  const echoTrace = createOutputEchoTrace(sessionId);
  const seenDelegations = new Set<string>();
  const openDelegations = new Set<string>();
  const pendingAppends = new Map<string, LiveAppendResult>();
  const peers = new Map<ConnectionKind, RTCPeerConnection>();
  const channels = new Map<ConnectionKind, RTCDataChannel>();
  const ready = new Set<ConnectionKind>();
  const recoveryTimers = new Map<
    ConnectionKind,
    ReturnType<typeof setTimeout>
  >();
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
  let microphoneMuted = false;
  let speakerMuted = false;
  let speakerVolume = 1;
  let voice = "marin";
  let detachAudioSettings: (() => void) | undefined;
  let started = false;
  let playbackBlocked = false;
  let playbackAttempt = 0;
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

  const activeState = (
    phase: "connecting" | "connected",
    activity?: LiveConversationState["activity"],
  ): LiveConversationState => ({
    phase,
    message: playbackBlocked
      ? "Audio playback is blocked. Select Play voice audio to hear Live."
      : null,
    ...(playbackBlocked ? { playbackBlocked: true } : {}),
    ...(activity ? { activity } : {}),
  });

  const reportAppendResult = (result: LiveAppendResult) => {
    logLiveDiagnostic("append.result", { sessionId, ...result });
    onAppendResult(result);
  };

  const stopMedia = () => {
    echoTrace.end();
    detachAudioSettings?.();
    detachAudioSettings = undefined;
    pendingAppends.clear();
    openDelegations.clear();
    clearTimeout(activityTimer);
    recoveryTimers.forEach((timer) => clearTimeout(timer));
    recoveryTimers.clear();
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

  const applyMicrophoneMuted = () => {
    if (!microphoneMuted) audioSettings?.actions.stopVoicePreview?.();
    if (!microphone) return;
    for (const audioTrack of microphone.getAudioTracks()) {
      audioTrack.enabled = !microphoneMuted;
    }
  };

  const finish = (liveConfirmed: boolean) => {
    if (finished) return;
    logLiveDiagnostic("session.finished", {
      sessionId,
      liveConfirmed,
      failed: failure !== undefined,
    });
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
    logLiveDiagnostic("session.stopping", {
      sessionId,
      pendingAppends: pendingAppends.size,
      openDelegations: openDelegations.size,
    });
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
    logLiveDiagnostic("session.failure", { sessionId, reason: message });
    // Only application-authored errors reach this function, never raw provider
    // events, SDP, credentials or transcripts. Preserve the first failure even
    // when the panel is collapsed or no longer showing the consent card.
    // oxlint-disable-next-line no-console -- local connection diagnostics for the manual experiment.
    console.warn("[Petrinaut Live]", message);
    failure = message;
    if (ready.has("live")) void stop();
    else finish(false);
  };

  const handleConnectionState = (kind: ConnectionKind) => {
    if (stopping) return;
    const state = peers.get(kind)?.connectionState;
    logLiveDiagnostic("connection.state", {
      sessionId,
      connection: kind,
      state,
    });
    const label = kind === "live" ? "Live" : "Transcription";
    if (state === "failed" || state === "closed") {
      fail(`${label} media connection ended.`);
    } else if (
      state === "disconnected" &&
      ready.size === 2 &&
      !recoveryTimers.has(kind)
    ) {
      // ICE can recover on the existing peer. Each peer keeps its own fixed
      // deadline; neither recovery creates a session or replays input/output.
      recoveryTimers.set(
        kind,
        setTimeout(
          () =>
            fail(
              `${label} media connection did not recover. No automatic retry was made.`,
            ),
          connectionTimeoutMs,
        ),
      );
      lastActivity = undefined;
      lastOutputActivity = -Infinity;
      onState(activeState("connecting"));
    } else if (state === "connected" && recoveryTimers.has(kind)) {
      clearTimeout(recoveryTimers.get(kind));
      recoveryTimers.delete(kind);
      if (recoveryTimers.size === 0) onState(activeState("connected"));
    }
  };

  const sampleActivity = async () => {
    const livePeer = peers.get("live");
    if (stopping || !livePeer) return;
    let microphoneLevel = 0;
    let outputLevel = 0;
    let echoReturnLoss: number | undefined;
    let echoReturnLossEnhancement: number | undefined;
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
        if (report.type === "media-source") {
          microphoneLevel = report.audioLevel;
          if (
            "echoReturnLoss" in report &&
            typeof report.echoReturnLoss === "number"
          )
            echoReturnLoss = report.echoReturnLoss;
          if (
            "echoReturnLossEnhancement" in report &&
            typeof report.echoReturnLossEnhancement === "number"
          )
            echoReturnLossEnhancement = report.echoReturnLossEnhancement;
        }
        if (report.type === "inbound-rtp") outputLevel = report.audioLevel;
      });
    } catch {
      // Optional telemetry must not affect the session lifetime.
    }
    if (abort.signal.aborted) return;
    activityTimer = setTimeout(() => void sampleActivity(), 100);
    if (recoveryTimers.size > 0) return;
    const playing = audio?.srcObject && !audio.paused;
    if (playing && outputLevel > 0.01) lastOutputActivity = Date.now();
    echoTrace.sample(Date.now(), {
      audible: Boolean(playing) && outputLevel > 0.01,
      microphoneLevel,
      echoReturnLoss,
      echoReturnLossEnhancement,
      microphoneMuted,
      speakerMuted,
      speakerVolume,
      selectedSpeaker: Boolean(audio?.sinkId),
    });
    const activity = {
      microphoneLevel: microphoneMuted
        ? 0
        : Math.round(microphoneLevel * 100) / 100,
      outputActive: Boolean(playing) && Date.now() - lastOutputActivity < 500,
    };
    if (
      !lastActivity ||
      activity.microphoneLevel !== lastActivity.microphoneLevel ||
      activity.outputActive !== lastActivity.outputActive
    ) {
      lastActivity = activity;
      onState(activeState("connected", activity));
    }
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
        logLiveDiagnostic("input.finalized", {
          sessionId,
          itemId,
          inputId: input.id,
          characters: input.text.length,
          startedDuringOutput: echoTrace.startedDuringOutput(itemId),
        });
        onFinalizedInput(input);
      }
      itemId = committedAfter(itemId);
    }
  };

  const markReady = (kind: ConnectionKind) => {
    ready.add(kind);
    logLiveDiagnostic("connection.ready", { sessionId, connection: kind });
    if (ready.size !== 2) return;
    clearTimeout(connectionTimer);
    // A peer may have disconnected before the last session-ready event.
    peers.forEach((_, connectionKind) => handleConnectionState(connectionKind));
    if (stopping) return;
    if (audio && microphone)
      detachAudioSettings = audioSettings?.attach({
        stream: microphone,
        audio,
        senders: [...peers.values()].flatMap((peer) =>
          peer.getSenders().filter((sender) => sender.track?.kind === "audio"),
        ),
        replaceMicrophone: (stream) => {
          microphone = stream;
          logCaptureSettings(sessionId, stream, "microphone-switched");
          applyMicrophoneMuted();
        },
      });
    if (recoveryTimers.size === 0) onState(activeState("connected"));
    activityTimer = setTimeout(() => void sampleActivity(), 100);
    flushFinalizedInputs();
  };

  const handleTranscriptionEvent = (data: Record<string, unknown>) => {
    if (data.type === "session.created" || data.type === "session.updated") {
      if (!ready.has("transcription")) markReady("transcription");
      return;
    }
    if (data.type === "input_audio_buffer.speech_started") {
      echoTrace.transcriptionSpeechStarted(data.item_id);
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
    if (
      import.meta.env.DEV &&
      typeof data.type === "string" &&
      [
        "session.started",
        "session.created",
        "session.updated",
        "session.closed",
        "session.delegation.created",
        "session.commentary.appended",
        "session.instructions.appended",
        "input_audio_buffer.speech_started",
        "input_audio_buffer.speech_stopped",
        "input_audio_buffer.committed",
        "conversation.item.input_audio_transcription.completed",
        "conversation.item.input_audio_transcription.failed",
        "error",
        "session.error",
      ].includes(data.type)
    ) {
      const fields = data as Record<string, unknown>;
      const delegation =
        typeof fields.delegation === "object" && fields.delegation !== null
          ? (fields.delegation as Record<string, unknown>)
          : undefined;
      // Receipt time and provider offsets are observations, not a shared audio clock.
      // Never spread provider data: transcripts, metadata, SDP and errors may contain secrets.
      logLiveDiagnostic("provider.event", {
        sessionId,
        connection: kind,
        type: data.type,
        itemId: typeof fields.item_id === "string" ? fields.item_id : undefined,
        previousItemId:
          typeof fields.previous_item_id === "string" ||
          fields.previous_item_id === null
            ? fields.previous_item_id
            : undefined,
        contentIndex:
          typeof fields.content_index === "number"
            ? fields.content_index
            : undefined,
        audioStartMs:
          typeof fields.audio_start_ms === "number"
            ? fields.audio_start_ms
            : undefined,
        audioEndMs:
          typeof fields.audio_end_ms === "number"
            ? fields.audio_end_ms
            : undefined,
        offsetMs:
          typeof fields.offset_ms === "number" ? fields.offset_ms : undefined,
        delegationId:
          typeof delegation?.id === "string" ? delegation.id : undefined,
        target:
          typeof delegation?.target === "string"
            ? delegation.target
            : undefined,
        clientEventId:
          typeof fields.client_event_id === "string"
            ? fields.client_event_id
            : undefined,
      });
    }
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
    } else if (data.type === "session.delegation.created") {
      if (!("delegation" in data)) return;
      const { delegation } = data;
      if (
        typeof delegation !== "object" ||
        delegation === null ||
        !("target" in delegation) ||
        delegation.target !== "client" ||
        !("id" in delegation) ||
        typeof delegation.id !== "string" ||
        !delegation.id ||
        seenDelegations.has(delegation.id)
      )
        return;
      seenDelegations.add(delegation.id);
      openDelegations.add(delegation.id);
      logLiveDiagnostic("delegation.accepted", {
        sessionId,
        delegationId: delegation.id,
      });
      onDelegation(delegation.id);
    } else if (
      data.type === "session.commentary.appended" ||
      data.type === "session.instructions.appended"
    ) {
      if (
        !("client_event_id" in data) ||
        typeof data.client_event_id !== "string"
      )
        return;
      const pending = pendingAppends.get(data.client_event_id);
      if (!pending || data.type !== `session.${pending.kind}.appended`) return;
      pendingAppends.delete(pending.eventId);
      if (pending.delegationId !== null)
        openDelegations.delete(pending.delegationId);
      reportAppendResult({ ...pending, status: "accepted" });
    } else if (data.type === "session.output_transcript.delta") {
      echoTrace.liveOutputFragment(
        "start_ms" in data ? data.start_ms : undefined,
        "end_ms" in data ? data.end_ms : undefined,
      );
    } else if (data.type === "session.input_transcript.delta") {
      echoTrace.liveInputFragment(
        "start_ms" in data ? data.start_ms : undefined,
      );
    } else if (
      !stopping &&
      (data.type === "error" || data.type === "session.error")
    ) {
      let clientEventId =
        "client_event_id" in data && typeof data.client_event_id === "string"
          ? data.client_event_id
          : undefined;
      if (
        "error" in data &&
        typeof data.error === "object" &&
        data.error !== null &&
        "client_event_id" in data.error &&
        typeof data.error.client_event_id === "string"
      ) {
        clientEventId = data.error.client_event_id;
      }
      if (clientEventId !== undefined) {
        const pending = pendingAppends.get(clientEventId);
        // A stale or unrelated command error cannot reject another append.
        if (!pending) return;
        pendingAppends.delete(pending.eventId);
        reportAppendResult({ ...pending, status: "rejected" });
        return;
      }
      fail("Live reported an error. No automatic retry was made.");
    }
  };

  const playAudio = async (): Promise<void> => {
    const currentAudio = audio;
    if (stopping || !currentAudio?.srcObject) return;
    const attempt = ++playbackAttempt;
    try {
      await currentAudio.play();
    } catch {
      if (abort.signal.aborted || attempt !== playbackAttempt) return;
      playbackBlocked = true;
      onState(
        activeState(
          ready.size === 2 && recoveryTimers.size === 0
            ? "connected"
            : "connecting",
          lastActivity,
        ),
      );
      return;
    }
    if (abort.signal.aborted || attempt !== playbackAttempt || !playbackBlocked)
      return;
    playbackBlocked = false;
    onState(
      activeState(
        ready.size === 2 && recoveryTimers.size === 0
          ? "connected"
          : "connecting",
        lastActivity,
      ),
    );
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
    connection.addEventListener("connectionstatechange", () =>
      handleConnectionState(kind),
    );
    if (kind === "live") {
      connection.addEventListener("track", (event) => {
        if (stopping) {
          event.track.stop();
          return;
        }
        if (!audio) return;
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void playAudio();
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
      headers: {
        "content-type": "application/sdp",
        ...(kind === "live" ? { [voicePreferenceHeader]: voice } : {}),
      },
      body: sdp,
      signal: abort.signal,
    });
    logLiveDiagnostic("connection.http", {
      sessionId,
      connection: kind,
      status: response.status,
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
    voice = audioSettings?.startSession() ?? "marin";
    logLiveDiagnostic("session.starting", { sessionId });
    onState(activeState("connecting"));
    connectionTimer = setTimeout(
      () =>
        fail(
          `Voice connections timed out (${connectionProgress()}). No automatic retry was made.`,
        ),
      connectionTimeoutMs,
    );
    try {
      audio = new Audio();
      audio.autoplay = true;
      audio.muted = speakerMuted;
      audio.volume = speakerVolume;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (abort.signal.aborted) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      microphone = stream;
      logCaptureSettings(sessionId, stream, "started");
      applyMicrophoneMuted();
      if (!audioSettings)
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

  const append = (
    kind: LiveAppendResult["kind"],
    text: string,
    delegationId: string | null,
  ): boolean => {
    if (stopping) return false;
    const result: LiveAppendResult = {
      eventId: crypto.randomUUID(),
      kind,
      delegationId,
      status: "unknown",
    };
    const liveChannel = channels.get("live");
    if (
      ready.size !== 2 ||
      liveChannel?.readyState !== "open" ||
      !text.trim()
    ) {
      reportAppendResult({ ...result, status: "local-failure" });
      return false;
    }
    pendingAppends.set(result.eventId, result);
    try {
      liveChannel.send(
        JSON.stringify({
          type: `session.${kind}.append`,
          event_id: result.eventId,
          delegation_id: delegationId,
          content: text,
        }),
      );
    } catch {
      pendingAppends.delete(result.eventId);
      reportAppendResult({ ...result, status: "local-failure" });
      return false;
    }
    reportAppendResult(result);
    return true;
  };

  const setMicrophoneMuted = (muted: boolean): void => {
    if (stopping || finished) return;
    microphoneMuted = muted;
    applyMicrophoneMuted();
  };

  const setSpeakerMuted = (muted: boolean): void => {
    if (stopping || finished) return;
    speakerMuted = muted;
    if (audio) audio.muted = muted;
  };

  const setSpeakerVolume = (volume: number): void => {
    if (stopping || finished) return;
    speakerVolume = Math.min(1, Math.max(0, volume));
    if (audio) audio.volume = speakerVolume;
  };

  return {
    retryPlayback: playAudio,
    start,
    stop,
    setMicrophoneMuted,
    setSpeakerMuted,
    setSpeakerVolume,
    openDelegations: openDelegations as ReadonlySet<string>,
    appendCommentary: (text: string, delegationId: string | null) =>
      append("commentary", text, delegationId),
    appendInstructions: (text: string, delegationId: string | null) =>
      append("instructions", text, delegationId),
  };
};
