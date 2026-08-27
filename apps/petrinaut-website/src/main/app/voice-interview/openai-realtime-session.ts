export interface OpenAIRealtimeTranscriptKey {
  readonly connectionEpoch: number;
  readonly contentIndex: number;
  readonly itemId: string;
}

export type OpenAIRealtimeSessionEvent =
  | {
      readonly connectionEpoch: number;
      readonly itemId: string;
      readonly type: "input-committed";
    }
  | {
      readonly key: OpenAIRealtimeTranscriptKey;
      readonly text: string;
      readonly type: "partial" | "completed";
    }
  | { readonly message: string; readonly type: "error" };

interface OpenAIRealtimeSessionDependencies {
  readonly connectionTimeoutMs: number;
  readonly createPeerConnection: () => RTCPeerConnection;
  readonly fetch: typeof globalThis.fetch;
  readonly getUserMedia: (
    constraints: MediaStreamConstraints,
  ) => Promise<MediaStream>;
}

type SessionListener = (event: OpenAIRealtimeSessionEvent) => void;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const parseRealtimeEvent = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
};

const stopStream = (stream: MediaStream): void => {
  for (const track of stream.getTracks()) {
    track.stop();
  }
};

const waitForAbort = <Value>(
  promise: Promise<Value>,
  signal: AbortSignal,
): Promise<Value> => {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }

  return new Promise((resolve, reject) => {
    const handleAbort = () => reject(signal.reason);
    signal.addEventListener("abort", handleAbort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", handleAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", handleAbort);
        reject(error);
      },
    );
  });
};

export class OpenAIRealtimeSession {
  readonly #dependencies: OpenAIRealtimeSessionDependencies;
  readonly #listeners = new Set<SessionListener>();
  #abortController: AbortController | null = null;
  #activeEpoch: number | null = null;
  #connected = false;
  #dataChannel: RTCDataChannel | null = null;
  #epoch = 0;
  #mediaStream: MediaStream | null = null;
  #messageListener: ((event: MessageEvent<unknown>) => void) | null = null;
  #microphoneTrack: MediaStreamTrack | null = null;
  #peerConnection: RTCPeerConnection | null = null;
  #unexpectedCloseListener: (() => void) | null = null;

  public constructor(dependencies: OpenAIRealtimeSessionDependencies) {
    this.#dependencies = dependencies;
  }

  public subscribe(listener: SessionListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public async connect(): Promise<number> {
    this.#releaseResources();

    const connectionEpoch = ++this.#epoch;
    this.#activeEpoch = connectionEpoch;
    const abortController = new AbortController();
    this.#abortController = abortController;
    const timeoutError = new DOMException(
      "Connection timed out",
      "TimeoutError",
    );
    const timeout = globalThis.setTimeout(() => {
      abortController.abort(timeoutError);
    }, this.#dependencies.connectionTimeoutMs);

    try {
      let mediaStream: MediaStream;
      try {
        const mediaStreamPromise = this.#dependencies.getUserMedia({
          audio: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        void mediaStreamPromise.then(
          (lateMediaStream) => {
            if (this.#activeEpoch !== connectionEpoch) {
              stopStream(lateMediaStream);
            }
          },
          () => undefined,
        );
        mediaStream = await waitForAbort(
          mediaStreamPromise,
          abortController.signal,
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          throw new Error(
            "Microphone access is required to start voice input.",
          );
        }
        throw error;
      }

      if (this.#activeEpoch !== connectionEpoch) {
        stopStream(mediaStream);
        throw new DOMException("Connection replaced", "AbortError");
      }
      this.#mediaStream = mediaStream;

      const [microphoneTrack] = mediaStream.getAudioTracks();
      if (!microphoneTrack) {
        throw new Error("No microphone is available for voice input.");
      }
      microphoneTrack.enabled = false;
      this.#microphoneTrack = microphoneTrack;

      const peerConnection = this.#dependencies.createPeerConnection();
      this.#peerConnection = peerConnection;
      peerConnection.addTrack(microphoneTrack, mediaStream);
      peerConnection.onconnectionstatechange = () => {
        if (
          this.#activeEpoch === connectionEpoch &&
          peerConnection.connectionState === "failed"
        ) {
          this.#handleConnectionFailure();
        }
      };

      const dataChannel = peerConnection.createDataChannel("oai-events");
      this.#dataChannel = dataChannel;
      const messageListener = (event: MessageEvent<unknown>) => {
        if (this.#activeEpoch === connectionEpoch) {
          this.#handleMessage(event, connectionEpoch);
        }
      };
      const unexpectedCloseListener = () => {
        if (this.#activeEpoch === connectionEpoch && this.#connected) {
          this.#handleConnectionFailure();
        }
      };
      this.#messageListener = messageListener;
      this.#unexpectedCloseListener = unexpectedCloseListener;
      dataChannel.addEventListener("message", messageListener);
      dataChannel.addEventListener("close", unexpectedCloseListener);

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      const offerSdp = peerConnection.localDescription?.sdp ?? offer.sdp;
      if (!offerSdp) {
        throw new Error("The browser could not create a voice connection.");
      }

      const response = await this.#dependencies.fetch(
        "/api/voice/realtime-call",
        {
          body: offerSdp,
          headers: { "content-type": "application/sdp" },
          method: "POST",
          signal: abortController.signal,
        },
      );
      if (!response.ok) {
        throw new Error("The voice connection could not be established.");
      }
      const answerSdp = await response.text();
      if (!answerSdp.trim()) {
        throw new Error("The voice connection returned an invalid answer.");
      }

      await peerConnection.setRemoteDescription({
        sdp: answerSdp,
        type: "answer",
      });
      await this.#waitForDataChannelOpen(dataChannel, abortController.signal);
      if (this.#activeEpoch !== connectionEpoch) {
        throw new DOMException("Connection replaced", "AbortError");
      }

      this.#connected = true;
      return connectionEpoch;
    } catch (error) {
      if (this.#activeEpoch === connectionEpoch) {
        this.#releaseResources();
      }
      if (abortController.signal.reason === timeoutError) {
        throw new Error("The voice connection timed out. Try reconnecting.");
      }
      if (error instanceof Error && !(error instanceof DOMException)) {
        throw error;
      }
      throw new Error("The voice connection could not be established.");
    } finally {
      globalThis.clearTimeout(timeout);
      if (this.#abortController === abortController) {
        this.#abortController = null;
      }
    }
  }

  public setMicrophoneEnabled(enabled: boolean): void {
    if (this.#microphoneTrack) {
      this.#microphoneTrack.enabled = enabled && this.#connected;
    }
  }

  public async disconnect(): Promise<void> {
    this.#releaseResources();
  }

  #emit(event: OpenAIRealtimeSessionEvent): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }

  #handleConnectionFailure(): void {
    if (!this.#connected) {
      return;
    }
    this.#releaseResources();
    this.#emit({
      message: "The voice connection failed. Try reconnecting.",
      type: "error",
    });
  }

  #handleMessage(event: MessageEvent<unknown>, connectionEpoch: number): void {
    const parsed = parseRealtimeEvent(event.data);
    if (!parsed || typeof parsed.type !== "string") {
      return;
    }

    if (parsed.type === "input_audio_buffer.committed") {
      if (typeof parsed.item_id !== "string" || !parsed.item_id) {
        return;
      }
      this.setMicrophoneEnabled(false);
      this.#emit({
        connectionEpoch,
        itemId: parsed.item_id,
        type: "input-committed",
      });
      return;
    }

    if (parsed.type === "error") {
      this.#releaseResources();
      this.#emit({
        message: "The voice service reported an error. Try reconnecting.",
        type: "error",
      });
      return;
    }

    if (parsed.type === "conversation.item.input_audio_transcription.failed") {
      this.#releaseResources();
      this.#emit({
        message: "Voice transcription failed. Try reconnecting.",
        type: "error",
      });
      return;
    }

    const transcriptEventType =
      parsed.type === "conversation.item.input_audio_transcription.delta"
        ? "partial"
        : parsed.type ===
            "conversation.item.input_audio_transcription.completed"
          ? "completed"
          : null;
    if (
      transcriptEventType === null ||
      typeof parsed.item_id !== "string" ||
      !parsed.item_id ||
      !Number.isInteger(parsed.content_index) ||
      (parsed.content_index as number) < 0
    ) {
      return;
    }

    const text =
      transcriptEventType === "partial" ? parsed.delta : parsed.transcript;
    if (typeof text !== "string") {
      return;
    }
    if (transcriptEventType === "completed") {
      this.setMicrophoneEnabled(false);
    }
    this.#emit({
      key: {
        connectionEpoch,
        contentIndex: parsed.content_index as number,
        itemId: parsed.item_id,
      },
      text,
      type: transcriptEventType,
    });
  }

  #releaseResources(): void {
    this.#activeEpoch = null;
    this.#connected = false;
    this.#abortController?.abort();
    this.#abortController = null;

    if (this.#dataChannel && this.#messageListener) {
      this.#dataChannel.removeEventListener("message", this.#messageListener);
    }
    if (this.#dataChannel && this.#unexpectedCloseListener) {
      this.#dataChannel.removeEventListener(
        "close",
        this.#unexpectedCloseListener,
      );
    }
    this.#messageListener = null;
    this.#unexpectedCloseListener = null;
    this.#dataChannel?.close();
    this.#dataChannel = null;

    if (this.#peerConnection) {
      this.#peerConnection.onconnectionstatechange = null;
      this.#peerConnection.close();
      this.#peerConnection = null;
    }
    if (this.#mediaStream) {
      if (this.#microphoneTrack) {
        this.#microphoneTrack.enabled = false;
      }
      stopStream(this.#mediaStream);
      this.#mediaStream = null;
    }
    this.#microphoneTrack = null;
  }

  #waitForDataChannelOpen(
    dataChannel: RTCDataChannel,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) {
      return Promise.reject(signal.reason);
    }
    if (dataChannel.readyState === "open") {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const handleResult = (event: Event) => {
        dataChannel.removeEventListener("open", handleResult);
        dataChannel.removeEventListener("error", handleResult);
        signal.removeEventListener("abort", handleResult);

        if (event.type === "open") {
          resolve();
        } else if (event.type === "abort") {
          reject(new DOMException("Connection aborted", "AbortError"));
        } else {
          reject(new Error("The voice event channel failed to open."));
        }
      };

      dataChannel.addEventListener("open", handleResult);
      dataChannel.addEventListener("error", handleResult);
      signal.addEventListener("abort", handleResult, { once: true });
    });
  }
}
