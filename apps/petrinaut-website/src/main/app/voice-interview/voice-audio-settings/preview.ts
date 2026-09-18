import {
  voicePreferenceHeader,
  type VoiceProvider,
} from "../../../../shared/voice-settings";

type PreviewState = "loading" | "playing" | null;
type Output = { muted: boolean; volume: number; sinkId?: string };

/** An isolated, bounded voice sample. Never captures a microphone or invokes Brunch. */
export const previewVoice = ({
  provider,
  voice,
  output,
  onState,
}: {
  provider: VoiceProvider;
  voice: string;
  output: () => Output;
  onState: (state: PreviewState, error?: string) => void;
}): (() => void) => {
  const abort = new AbortController();
  let peer: RTCPeerConnection | undefined;
  let channel: RTCDataChannel | undefined;
  let context: AudioContext | undefined;
  let audio: HTMLAudioElement | undefined;
  let silence: MediaStream | undefined;
  let oscillator: OscillatorNode | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let meter: ReturnType<typeof setInterval> | undefined;
  let started = false;
  let playing = false;
  let lastSound = 0;
  let sinkId: string | undefined;
  let switchingSink = false;
  let sessionReady = false;

  const closeTransport = () => {
    channel?.close();
    peer?.close();
  };

  const stop = (error?: string) => {
    if (abort.signal.aborted) return;
    abort.abort();
    clearTimeout(timer);
    clearInterval(meter);
    if (provider === "live" && sessionReady && channel?.readyState === "open") {
      // Stop local audio immediately, but let Live acknowledge finalization.
      const deadline = setTimeout(closeTransport, 2_000);
      channel.addEventListener("message", (event: MessageEvent<string>) => {
        try {
          const message: unknown = JSON.parse(event.data);
          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === "session.closed"
          ) {
            clearTimeout(deadline);
            closeTransport();
          }
        } catch {
          /* The deadline still releases a broken connection. */
        }
      });
      try {
        channel.send(JSON.stringify({ type: "session.close" }));
      } catch {
        clearTimeout(deadline);
        closeTransport();
      }
    } else closeTransport();
    silence?.getTracks().forEach((track) => track.stop());
    oscillator?.stop();
    if (audio) {
      audio.pause();
      audio.srcObject = null;
    }
    if (context) void context.close().catch(() => {});
    onState(null, error);
  };
  const fail = () => stop("Preview unavailable. Select a voice to try again.");
  const syncOutput = async () => {
    if (!audio || abort.signal.aborted) return;
    const current = output();
    audio.muted = current.muted;
    audio.volume = current.volume;
    const nextSink = current.sinkId ?? "";
    if (
      typeof audio.setSinkId === "function" &&
      sinkId !== nextSink &&
      !switchingSink
    ) {
      switchingSink = true;
      try {
        await audio.setSinkId(nextSink);
        sinkId = nextSink;
      } finally {
        switchingSink = false;
      }
    }
  };

  const run = async () => {
    onState("loading");
    // Resume synchronously from the selection gesture. Silence advances Live's
    // session clock without requesting or transmitting microphone capture.
    context = new AudioContext();
    const resumed = context.resume();
    audio = new Audio();
    peer = new RTCPeerConnection();
    channel = peer.createDataChannel("oai-events");
    const destination = context.createMediaStreamDestination();
    silence = destination.stream;
    oscillator = context.createOscillator();
    const gain = context.createGain();
    gain.gain.value = 0;
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    silence.getTracks().forEach((track) => peer!.addTrack(track, silence!));
    timer = setTimeout(
      () =>
        stop(
          started
            ? undefined
            : "Preview timed out. Select a voice to try again.",
        ),
      15_000,
    );

    channel.addEventListener("message", (event: MessageEvent<string>) => {
      if (abort.signal.aborted) return;
      let message: unknown;
      try {
        message = JSON.parse(event.data);
      } catch {
        fail();
        return;
      }
      if (!message || typeof message !== "object" || !("type" in message))
        return;
      if (message.type === "error") {
        fail();
        return;
      }
      if (
        message.type ===
        (provider === "live" ? "session.started" : "session.created")
      ) {
        if (sessionReady) return;
        sessionReady = true;
        const instructions =
          'This is a voice sample, not an interview. Immediately say only: "Hi, I’m here to help you think it through." Then remain silent. Do not delegate or use tools.';
        channel?.send(
          JSON.stringify(
            provider === "live"
              ? {
                  type: "session.instructions.append",
                  event_id: "voice_preview",
                  delegation_id: null,
                  content: instructions,
                }
              : {
                  type: "response.create",
                  response: {
                    conversation: "none",
                    input: [],
                    instructions,
                    tools: [],
                    tool_choice: "none",
                    max_output_tokens: 256,
                  },
                },
          ),
        );
      }
    });
    channel.addEventListener("error", fail);
    peer.addEventListener("connectionstatechange", () => {
      if (peer?.connectionState === "failed") fail();
    });
    peer.addEventListener("track", (event) => {
      if (abort.signal.aborted || !audio || !context) return;
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      audio.srcObject = stream;
      const analyser = context.createAnalyser();
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      void (async () => {
        await syncOutput();
        if (abort.signal.aborted) return;
        await audio!.play();
        abort.signal.throwIfAborted();
        clearInterval(meter);
        meter = setInterval(() => {
          void syncOutput().catch(fail);
          analyser.getFloatTimeDomainData(samples);
          const audible = samples.some((sample) => Math.abs(sample) > 0.01);
          if (audible) {
            started = true;
            lastSound = Date.now();
          }
          const current = output();
          const nextPlaying =
            started &&
            Date.now() - lastSound < 400 &&
            !current.muted &&
            current.volume > 0;
          if (playing !== nextPlaying) {
            playing = nextPlaying;
            onState(playing ? "playing" : started ? null : "loading");
          }
          // Live has no output-audio-done event. End after the short utterance,
          // with the deadline above bounding silence, stalls, and long speech.
          if (started && Date.now() - lastSound > 900) stop();
        }, 100);
      })().catch(fail);
    });
    await resumed;
    abort.signal.throwIfAborted();
    await peer.setLocalDescription(await peer.createOffer());
    abort.signal.throwIfAborted();
    if (peer.iceGatheringState !== "complete") {
      await new Promise<void>((resolve, reject) => {
        peer!.addEventListener(
          "icegatheringstatechange",
          () => {
            if (peer?.iceGatheringState === "complete") resolve();
          },
          { signal: abort.signal },
        );
        abort.signal.addEventListener(
          "abort",
          () => reject(abort.signal.reason),
          { once: true },
        );
      });
    }
    abort.signal.throwIfAborted();
    const response = await fetch(
      `/api/voice/${provider === "live" ? "live-session" : "realtime-call"}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/sdp",
          [voicePreferenceHeader]: voice,
        },
        body: peer.localDescription?.sdp,
        signal: abort.signal,
      },
    );
    if (!response.ok) throw new Error("Preview connection failed");
    const answer: unknown =
      provider === "live" ? await response.json() : await response.text();
    const sdp =
      typeof answer === "string"
        ? answer
        : answer && typeof answer === "object" && "sdp" in answer
          ? answer.sdp
          : null;
    if (typeof sdp !== "string" || !sdp.trimStart().startsWith("v=0"))
      throw new Error("Invalid preview answer");
    abort.signal.throwIfAborted();
    await peer.setRemoteDescription({ type: "answer", sdp });
  };
  void run().catch(() => {
    if (!abort.signal.aborted) fail();
  });
  return () => stop();
};
