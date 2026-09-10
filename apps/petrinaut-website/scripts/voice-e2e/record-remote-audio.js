// Injected before the application. Observe native events without replacing its
// listeners, ontrack property, provider messages, or microphone stream.
(() => {
  /** @type {Blob[]} */
  const chunks = [];
  /** @type {import('./trace-checks.ts').InputCommit[]} */
  const commits = [];
  /** @type {import('./trace-checks.ts').LatencyMark[]} */
  const latency = [];
  /** @type {MediaRecorder | undefined} */
  let recorder;
  /** @type {number | undefined} */
  let startedAt;
  /** @type {number | undefined} */
  let finishedAt;
  /** @type {number | undefined} */
  let microphoneRequestedAt;
  /** @type {Promise<void> | undefined} */
  let stopped;
  /** @type {Promise<string> | undefined} */
  let recording;
  /** @type {string | undefined} */
  let error;
  const observedChannels = new WeakSet();

  const originalMeasure = Performance.prototype.measure;
  Performance.prototype.measure = function (...args) {
    const measure = originalMeasure.apply(this, args);
    if (measure.name.startsWith("voice-interview:")) {
      const detail = /** @type {unknown} */ (measure.detail);
      if (
        typeof detail === "object" &&
        detail !== null &&
        "correlationId" in detail &&
        typeof detail.correlationId === "string"
      ) {
        latency.push({
          name: measure.name.slice("voice-interview:".length),
          elapsedMs: measure.duration,
          correlationId: detail.correlationId,
          observedAtMs: performance.now(),
        });
      }
    }
    return measure;
  };

  const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
  navigator.mediaDevices.getUserMedia = function (...args) {
    microphoneRequestedAt ??= performance.now();
    return originalGetUserMedia.apply(this, args);
  };

  /** @param {RTCDataChannel} channel */
  const observeChannel = (channel) => {
    if (observedChannels.has(channel)) return;
    observedChannels.add(channel);
    channel.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      try {
        const message = /** @type {unknown} */ (JSON.parse(event.data));
        // Only the approved commit identity leaves this listener. Never retain
        // provider payloads, SDP, transcripts, usage blobs, or audio messages.
        if (
          typeof message === "object" &&
          message !== null &&
          "type" in message &&
          message.type === "input_audio_buffer.committed" &&
          "item_id" in message &&
          typeof message.item_id === "string"
        ) {
          const itemId = message.item_id;
          if (!commits.some((commit) => commit.itemId === itemId))
            commits.push({ itemId, observedAtMs: performance.now() });
        }
      } catch {
        // Ignore unrelated/non-JSON messages without exposing their contents.
      }
    });
  };

  const NativePeerConnection = window.RTCPeerConnection;
  window.RTCPeerConnection = new Proxy(NativePeerConnection, {
    construct(target, args, newTarget) {
      const peer = /** @type {RTCPeerConnection} */ (
        Reflect.construct(target, args, newTarget)
      );
      const createDataChannel = peer.createDataChannel;
      peer.createDataChannel = function (...parameters) {
        const channel = createDataChannel.apply(this, parameters);
        observeChannel(channel);
        return channel;
      };
      peer.addEventListener("datachannel", (event) =>
        observeChannel(event.channel),
      );
      peer.addEventListener("track", (event) => {
        if (event.track.kind !== "audio" || recorder) return;
        try {
          // A track event can have no streams. Record the track itself.
          const capture = new MediaRecorder(new MediaStream([event.track]), {
            mimeType: "audio/webm;codecs=opus",
          });
          recorder = capture;
          capture.addEventListener("dataavailable", (data) => {
            if (data.data.size > 0) chunks.push(data.data);
          });
          stopped = new Promise((resolveStopped) => {
            capture.addEventListener(
              "stop",
              () => {
                finishedAt = performance.now();
                resolveStopped();
              },
              { once: true },
            );
            capture.addEventListener(
              "error",
              () => {
                error = "remote-audio-recorder-failed";
                finishedAt = performance.now();
                resolveStopped();
              },
              { once: true },
            );
          });
          capture.start(250);
          startedAt = performance.now();
        } catch {
          error = "remote-audio-recorder-unavailable";
        }
      });
      return peer;
    },
  });

  /** @type {Window & { __voiceE2E?: unknown }} */ (window).__voiceE2E = {
    commits,
    latency,
    get error() {
      return error;
    },
    get microphoneRequestedAt() {
      return microphoneRequestedAt;
    },
    get recordedMs() {
      return startedAt === undefined
        ? 0
        : (finishedAt ?? performance.now()) - startedAt;
    },
    stopRecording: () => {
      recording ??= (async () => {
        if (!recorder) return "";
        if (recorder.state !== "inactive") recorder.stop();
        await stopped;
        const blob = new Blob(chunks, { type: "audio/webm;codecs=opus" });
        /** @type {Promise<string>} */
        const encoded = new Promise((resolveBase64, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolveBase64(
              typeof reader.result === "string"
                ? (reader.result.split(",")[1] ?? "")
                : "",
            );
          reader.onerror = () => reject(new Error("recording-read-failed"));
          reader.readAsDataURL(blob);
        });
        return encoded;
      })();
      return recording;
    },
  };
})();
