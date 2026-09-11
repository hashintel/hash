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

/** One disposable Live session. No composer, tool, transcript or turn-settlement interface. */
export const createLiveConversation = (
  onState: (state: LiveConversationState) => void,
  connectionTimeoutMs: number,
) => {
  const abort = new AbortController();
  let peer: RTCPeerConnection | undefined;
  let channel: RTCDataChannel | undefined;
  let microphone: MediaStream | undefined;
  let audio: HTMLAudioElement | undefined;
  let started = false;
  let ready = false;
  let stopping = false;
  let finished = false;
  let creationRequested = false;
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

  const sampleActivity = async () => {
    if (stopping || !peer) return;
    let microphoneLevel = 0;
    let outputLevel = 0;
    try {
      const stats = await peer.getStats();
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
      // Optional browser telemetry must not terminate or retry the conversation.
    }
    if (abort.signal.aborted) return;
    const playing = audio?.srcObject && !audio.paused && !audio.muted;
    if (playing && outputLevel > 0.01) lastOutputActivity = Date.now();
    const activity = {
      microphoneLevel: Math.round(microphoneLevel * 100) / 100,
      // Brief hold avoids flicker between syllables. This never settles a turn;
      // received audio energy also cannot prove that the user heard playback.
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

  const stopMedia = () => {
    clearTimeout(activityTimer);
    microphone?.getTracks().forEach((track) => track.stop());
    if (audio) {
      audio.muted = true;
      audio.pause();
      audio.srcObject = null;
    }
    peer?.getReceivers().forEach((receiver) => receiver.track.stop());
  };

  const finish = (confirmed: boolean) => {
    if (finished) return;
    finished = true;
    stopping = true;
    clearTimeout(connectionTimer);
    clearTimeout(closeTimer);
    abort.abort();
    stopMedia();
    channel?.close();
    peer?.close();
    const closure = confirmed
      ? "Live confirmed session closure."
      : creationRequested
        ? "Remote session closure was not confirmed."
        : "No provider session was requested.";
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
    onState({
      phase: "stopping",
      message: "Microphone and playback stopped. Closing Live…",
    });
    if (channel?.readyState === "open" && ready) {
      // Registered message listener remains until session.closed or this cleanup deadline.
      closeTimer = setTimeout(() => finish(false), 2_000);
      try {
        channel.send(JSON.stringify({ type: "session.close" }));
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
    failure = message;
    void stop();
  };

  const start = async (): Promise<void> => {
    if (started || stopping) return;
    started = true;
    onState({ phase: "connecting", message: null });
    connectionTimer = setTimeout(
      () => fail("Live connection timed out. No automatic retry was made."),
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
      peer = new RTCPeerConnection();
      const connection = peer;
      channel = connection.createDataChannel("oai-events");
      channel.addEventListener("message", (event: MessageEvent<string>) => {
        if (finished) return;
        let data: unknown;
        try {
          data = JSON.parse(event.data);
        } catch {
          fail("Live sent an unreadable event.");
          return;
        }
        if (typeof data !== "object" || data === null || !("type" in data))
          return;
        if (data.type === "session.closed") {
          finish(true);
          return;
        }
        if (stopping) return;
        if (data.type === "session.started" && !ready) {
          ready = true;
          clearTimeout(connectionTimer);
          onState({ phase: "connected", message: null });
          activityTimer = setTimeout(() => void sampleActivity(), 100);
        } else if (data.type === "error" || data.type === "session.error") {
          fail("Live reported an error. No automatic retry was made.");
        }
        // Transcript deltas are not finalized utterances. Delegations contain metadata,
        // not task text. Neither is forwarded, persisted, or used to execute anything.
      });
      channel.addEventListener("close", () => {
        if (!stopping) failure = "Live disconnected.";
        finish(false);
      });
      channel.addEventListener("error", () =>
        fail("Live data connection failed."),
      );
      connection.addEventListener("connectionstatechange", () => {
        if (
          ["failed", "disconnected", "closed"].includes(
            connection.connectionState,
          )
        )
          fail("Live media connection ended.");
      });
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
      stream.getTracks().forEach((track) => {
        track.addEventListener(
          "ended",
          () => fail("Microphone disconnected."),
          {
            signal: abort.signal,
          },
        );
        connection.addTrack(track, stream);
      });
      await connection.setLocalDescription(await connection.createOffer());
      abort.signal.throwIfAborted();
      if (connection.iceGatheringState !== "complete") {
        const listeners = new AbortController();
        await new Promise<void>((resolve, reject) => {
          const check = () => {
            if (connection.iceGatheringState === "complete") {
              resolve();
            }
          };
          const cancelled = () => {
            reject(abort.signal.reason);
          };
          connection.addEventListener("icegatheringstatechange", check, {
            signal: listeners.signal,
          });
          abort.signal.addEventListener("abort", cancelled, {
            once: true,
            signal: listeners.signal,
          });
          check();
        }).finally(() => listeners.abort());
      }
      abort.signal.throwIfAborted();
      const sdp = connection.localDescription?.sdp;
      if (!sdp) throw new Error("Missing local SDP");
      creationRequested = true;
      const response = await fetch("/api/voice/live-session", {
        method: "POST",
        headers: { "content-type": "application/sdp" },
        body: sdp,
        signal: abort.signal,
      });
      if (!response.ok) throw new Error("Session creation failed");
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
      await connection.setRemoteDescription({
        type: "answer",
        sdp: answer.sdp,
      });
      // WebRTC creation already starts Live. Wait for session.started; never send session.start.
    } catch {
      fail(
        "Live could not connect. Check microphone, audio permissions and server configuration. No automatic retry was made.",
      );
    }
  };

  return { start, stop };
};
