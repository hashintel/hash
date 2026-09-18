import type { VoiceProvider } from "../../../../shared/voice-settings";

type PreviewState = "loading" | "playing" | null;
type Output = { muted: boolean; volume: number; sinkId?: string };

// Bump the path version whenever a clip changes; production serves it immutable.
const previewRoot = "/voice-previews/v1";

/** A bounded static voice sample. Never captures a microphone or invokes a provider. */
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
  let audio: HTMLAudioElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let outputSync: ReturnType<typeof setInterval> | undefined;
  let started = false;
  let state: PreviewState = null;
  let sinkId: string | undefined;
  let switchingSink = false;

  const stop = (error?: string) => {
    if (abort.signal.aborted) return;
    abort.abort();
    clearTimeout(timer);
    clearInterval(outputSync);
    audio?.pause();
    audio?.removeAttribute("src");
    onState(null, error);
  };
  const fail = () => stop("Preview unavailable. Select a voice to try again.");
  const setState = (nextState: PreviewState) => {
    if (state === nextState) return;
    state = nextState;
    onState(nextState);
  };
  const syncOutput = async (): Promise<Output> => {
    if (!audio) throw new Error("Preview audio is unavailable");
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
    return current;
  };
  const updatePlayingState = (current: Output) => {
    setState(
      started && !current.muted && current.volume > 0 ? "playing" : null,
    );
  };

  const run = async () => {
    setState("loading");
    const currentAudio = new Audio(`${previewRoot}/${provider}/${voice}.mp3`);
    audio = currentAudio;
    timer = setTimeout(
      () =>
        stop(
          started
            ? undefined
            : "Preview timed out. Select a voice to try again.",
        ),
      15_000,
    );
    currentAudio.addEventListener("ended", () => stop(), {
      signal: abort.signal,
    });
    currentAudio.addEventListener("error", fail, { signal: abort.signal });
    await syncOutput();
    abort.signal.throwIfAborted();
    await currentAudio.play();
    abort.signal.throwIfAborted();
    started = true;
    updatePlayingState(output());
    outputSync = setInterval(() => {
      void syncOutput()
        .then((current) => {
          if (!abort.signal.aborted) updatePlayingState(current);
        })
        .catch(fail);
    }, 100);
  };
  void run().catch(() => {
    if (!abort.signal.aborted) fail();
  });
  return () => stop();
};
