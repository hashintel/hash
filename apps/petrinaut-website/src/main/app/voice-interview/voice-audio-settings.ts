import {
  isSupportedVoice,
  voiceNames,
  type VoiceProvider,
} from "../../../shared/voice-settings";

import type {
  PetrinautAiVoiceModeControls,
  PetrinautAiVoiceSessionState,
} from "@hashintel/petrinaut/ui";

type SettingsState = NonNullable<PetrinautAiVoiceSessionState["audioSettings"]>;
type SettingsActions = NonNullable<
  PetrinautAiVoiceModeControls["audioSettings"]
>;
type AudioOutput = { setSinkId?: (deviceId: string) => Promise<void> };
type AudioDevices = Pick<
  MediaDevices,
  | "getUserMedia"
  | "enumerateDevices"
  | "addEventListener"
  | "removeEventListener"
> & {
  selectAudioOutput?: () => Promise<MediaDeviceInfo>;
};
type Connection = {
  stream: MediaStream;
  audio: AudioOutput;
  senders: readonly Pick<RTCRtpSender, "replaceTrack">[];
  /** Commits capture to the session and reapplies its latest mute/turn state. */
  replaceMicrophone: (stream: MediaStream) => void;
};

const stopStream = (stream: MediaStream) =>
  stream.getTracks().forEach((track) => track.stop());
const storageKey = (provider: VoiceProvider) =>
  `petrinaut:voice:${provider}:v1`;
const browserStorage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

/** Session-local audio controls; only the next-session voice preference is persisted. */
export class VoiceAudioSettings {
  #state: SettingsState;
  #connection: Connection | undefined;
  #epoch = 0;
  #recoveryPending = false;
  #listeners = new Set<() => void>();
  #removeTrackListener = () => {};
  readonly actions: SettingsActions;

  constructor(
    readonly provider: VoiceProvider,
    readonly mediaDevices: AudioDevices | undefined,
    readonly storage:
      | Pick<Storage, "getItem" | "setItem">
      | undefined = browserStorage(),
  ) {
    let voice = "marin";
    try {
      const saved = storage?.getItem(storageKey(provider));
      if (saved && isSupportedVoice(provider, saved)) voice = saved;
    } catch {
      /* Storage is optional; the preference still works in memory. */
    }
    this.#state = {
      voice,
      activeVoice: voice,
      voices: voiceNames[provider].map((name) => ({
        value: name,
        text: name.charAt(0).toUpperCase() + name.slice(1),
      })),
      ...(provider === "realtime" ? { speed: 1 } : {}),
      devices: {
        microphones: [],
        speakers: [],
        microphoneId: "",
        speakerId: "",
        canSelectSpeaker: false,
        canRequestSpeaker: false,
        busy: false,
        message: null,
      },
    };
    this.actions = {
      setVoice: (selected) => {
        if (!isSupportedVoice(provider, selected)) return;
        let message: string | null = null;
        try {
          if (!storage) throw new Error("Storage unavailable");
          storage.setItem(storageKey(provider), selected);
        } catch {
          message =
            "Voice preference could not be saved. It will last until this page closes.";
        }
        this.#update({
          voice: selected,
          voiceSaveError: message,
        });
      },
      ...(provider === "realtime"
        ? {
            setSpeed: (speed: number) => {
              if (Number.isFinite(speed) && speed >= 0.25 && speed <= 1.5)
                this.#update({ speed });
            },
          }
        : {}),
      refreshDevices: () => {
        void this.refresh(true);
      },
      setMicrophoneDevice: (deviceId) => {
        void this.setMicrophone(deviceId);
      },
      setSpeakerDevice: (deviceId) => {
        void this.setSpeaker(deviceId);
      },
      requestSpeaker: () => {
        void this.requestSpeaker();
      },
    };
  }

  getSnapshot = (): SettingsState => this.#state;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  #update(update: Partial<SettingsState>) {
    this.#state = { ...this.#state, ...update };
    this.#listeners.forEach((listener) => listener());
  }
  #devices(update: Partial<SettingsState["devices"]>) {
    this.#update({ devices: { ...this.#state.devices, ...update } });
  }
  startSession(): string {
    this.#update({
      activeVoice: this.#state.voice,
      ...(this.provider === "realtime" ? { speed: 1 } : {}),
    });
    return this.#state.voice;
  }
  attach(connection: Connection) {
    this.detach();
    this.#connection = connection;
    this.#devices({
      microphoneId: "",
      speakerId: "",
      busy: false,
      message: null,
      canSelectSpeaker: typeof connection.audio.setSinkId === "function",
      canRequestSpeaker:
        typeof connection.audio.setSinkId === "function" &&
        typeof this.mediaDevices?.selectAudioOutput === "function",
    });
    this.#watchTrack(connection.stream);
    this.mediaDevices?.addEventListener("devicechange", this.#deviceChanged);
    void this.refresh(true);
    return () => {
      if (this.#connection === connection) this.detach();
    };
  }
  detach() {
    ++this.#epoch;
    this.#connection = undefined;
    this.#recoveryPending = false;
    this.#removeTrackListener();
    this.mediaDevices?.removeEventListener("devicechange", this.#deviceChanged);
    this.#devices({ busy: false });
  }
  #watchTrack(stream: MediaStream) {
    this.#removeTrackListener();
    const track = stream.getAudioTracks()[0];
    const ended = () => {
      void this.refresh(true);
    };
    track?.addEventListener("ended", ended);
    this.#removeTrackListener = () =>
      track?.removeEventListener("ended", ended);
  }
  #deviceChanged = () => {
    void this.refresh(true);
  };

  async refresh(recover = false) {
    const epoch = this.#epoch;
    if (!this.mediaDevices?.enumerateDevices || !this.#connection) return;
    if (recover && this.#state.devices.busy) {
      this.#recoveryPending = true;
      return;
    }
    try {
      const devices = await this.mediaDevices.enumerateDevices();
      if (epoch !== this.#epoch) return;
      const options = (kind: MediaDeviceKind) =>
        devices
          .filter(
            (device) =>
              device.kind === kind &&
              device.deviceId &&
              device.deviceId !== "default" &&
              device.deviceId !== "communications",
          )
          .map((device, index) => ({
            value: device.deviceId,
            text:
              device.label ||
              `${kind === "audioinput" ? "Microphone" : "Speaker"} ${index + 1}`,
          }));
      this.#devices({
        microphones: options("audioinput"),
        speakers: options("audiooutput"),
        ...(this.#state.devices.message === null &&
        !devices.some((device) => device.kind === "audioinput")
          ? {
              message:
                "No microphone detected. Connect one and refresh devices, or continue in text.",
            }
          : {}),
      });
      if (recover && this.#state.devices.busy) this.#recoveryPending = true;
      if (recover && !this.#state.devices.busy) {
        const { microphoneId, speakerId } = this.#state.devices;
        if (
          (microphoneId &&
            !devices.some((device) => device.deviceId === microphoneId)) ||
          this.#connection.stream
            .getAudioTracks()
            .some((track) => track.readyState === "ended")
        )
          await this.setMicrophone("", true);
        if (epoch !== this.#epoch) return;
        if (
          speakerId &&
          !devices.some((device) => device.deviceId === speakerId)
        )
          await this.setSpeaker("", true);
      }
    } catch {
      if (epoch === this.#epoch)
        this.#devices({
          message:
            "Could not list audio devices. Check browser permissions, then refresh.",
        });
    }
  }

  async setMicrophone(deviceId: string, fallback = false) {
    const connection = this.#connection;
    if (!connection || !this.mediaDevices || this.#state.devices.busy) return;
    const epoch = this.#epoch;
    this.#devices({ busy: true, message: null });
    let replacement: MediaStream | undefined;
    try {
      replacement = await this.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      });
      const track = replacement.getAudioTracks()[0];
      if (!track) throw new DOMException("No microphone", "NotFoundError");
      track.enabled = false;
      if (epoch !== this.#epoch) return;
      const previous = connection.stream;
      const previousTrack = previous.getAudioTracks()[0];
      const results = await Promise.allSettled(
        connection.senders.map((sender) => sender.replaceTrack(track)),
      );
      if (epoch !== this.#epoch) return;
      if (results.some((result) => result.status === "rejected")) {
        await Promise.allSettled(
          connection.senders.map((sender) =>
            sender.replaceTrack(previousTrack ?? null),
          ),
        );
        throw new Error("Microphone switch failed");
      }
      connection.stream = replacement;
      connection.replaceMicrophone(replacement);
      this.#watchTrack(replacement);
      replacement = undefined;
      stopStream(previous);
      this.#devices({
        microphoneId: deviceId,
        message: fallback
          ? "Microphone disconnected. Switched to system default."
          : null,
      });
    } catch (error) {
      if (epoch === this.#epoch)
        this.#devices({
          message:
            error instanceof DOMException && error.name === "NotAllowedError"
              ? "Microphone access denied. Allow microphone access in browser settings, then try again."
              : error instanceof DOMException && error.name === "NotFoundError"
                ? "No microphone detected. Connect one and try again, or continue in text."
                : "Could not switch microphone. Try again or restart Voice.",
        });
    } finally {
      if (replacement) stopStream(replacement);
      this.#finishOperation(epoch);
    }
  }

  #finishOperation(epoch: number) {
    if (epoch !== this.#epoch) return;
    this.#devices({ busy: false });
    const recover = this.#recoveryPending;
    this.#recoveryPending = false;
    void this.refresh(recover);
  }

  async setSpeaker(deviceId: string, fallback = false) {
    const connection = this.#connection;
    if (!connection?.audio.setSinkId || this.#state.devices.busy) return;
    const epoch = this.#epoch;
    this.#devices({ busy: true, message: null });
    try {
      await connection.audio.setSinkId(deviceId);
      if (epoch === this.#epoch)
        this.#devices({
          speakerId: deviceId,
          message: fallback
            ? "Speaker disconnected. Switched to system default."
            : null,
        });
    } catch (error) {
      if (epoch === this.#epoch)
        this.#devices({
          message:
            error instanceof DOMException && error.name === "NotAllowedError"
              ? "Speaker access denied. Choose an allowed speaker or use system default."
              : "Could not switch speaker. Check the device and try again.",
        });
    } finally {
      this.#finishOperation(epoch);
    }
  }
  async requestSpeaker() {
    if (
      !this.mediaDevices?.selectAudioOutput ||
      !this.#connection ||
      this.#state.devices.busy
    )
      return;
    const epoch = this.#epoch;
    this.#devices({ busy: true, message: null });
    let device: MediaDeviceInfo;
    try {
      // Invoke directly from the click, before any await, to retain user activation.
      device = await this.mediaDevices.selectAudioOutput();
    } catch {
      if (epoch === this.#epoch)
        this.#devices({
          message:
            "Speaker selection was not allowed or was cancelled. Your output is unchanged.",
        });
      this.#finishOperation(epoch);
      return;
    }
    if (epoch !== this.#epoch) return;
    this.#devices({ busy: false });
    await this.setSpeaker(device.deviceId);
  }
}
