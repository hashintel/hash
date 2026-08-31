import {
  createVoiceRequestId,
  VoiceError,
  VOICE_REQUEST_ID_HEADER,
  voiceDiagnosticOutcome,
  voiceDurationMs,
  voiceErrorFromResponse,
  voiceErrorMessage,
  type VoiceDiagnosticReporter,
  type VoiceErrorCode,
  type VoiceOperation,
} from "../../../voice-diagnostics";

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
  | {
      readonly code: VoiceErrorCode;
      readonly message: string;
      readonly requestId: string;
      readonly type: "error";
    };

interface OpenAIRealtimeSessionDependencies {
  readonly connectionTimeoutMs: number;
  readonly createRequestId?: () => string;
  readonly createPeerConnection: () => RTCPeerConnection;
  readonly fetch: typeof globalThis.fetch;
  readonly getUserMedia: (
    constraints: MediaStreamConstraints,
  ) => Promise<MediaStream>;
  readonly now?: () => number;
  readonly reportDiagnostic?: VoiceDiagnosticReporter;
}

type SessionListener = (event: OpenAIRealtimeSessionEvent) => void;

interface TranscriptionTiming {
  readonly requestId: string;
  readonly startedAt: number;
}

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
  #connectedAt: number | null = null;
  #connectionRequestId: string | null = null;
  #dataChannel: RTCDataChannel | null = null;
  #epoch = 0;
  #mediaStream: MediaStream | null = null;
  #messageListener: ((event: MessageEvent<unknown>) => void) | null = null;
  #microphoneTrack: MediaStreamTrack | null = null;
  #peerConnection: RTCPeerConnection | null = null;
  #unexpectedCloseListener: (() => void) | null = null;
  readonly #transcriptionTimings = new Map<string, TranscriptionTiming>();

  public constructor(dependencies: OpenAIRealtimeSessionDependencies) {
    this.#dependencies = dependencies;
  }

  public subscribe(listener: SessionListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public async connect(): Promise<number> {
    this.#releaseResources();

    const requestId =
      this.#dependencies.createRequestId?.() ?? createVoiceRequestId();
    const startedAt = this.#now();
    const connectionEpoch = ++this.#epoch;
    this.#activeEpoch = connectionEpoch;
    this.#connectionRequestId = requestId;
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
        if (
          error instanceof DOMException &&
          (error.name === "NotAllowedError" || error.name === "SecurityError")
        ) {
          throw new VoiceError(
            "connection",
            "microphone-permission",
            requestId,
          );
        }
        if (
          error instanceof DOMException &&
          [
            "DevicesNotFoundError",
            "NotFoundError",
            "NotReadableError",
            "OverconstrainedError",
            "TrackStartError",
          ].includes(error.name)
        ) {
          throw new VoiceError("connection", "microphone-device", requestId);
        }
        if (abortController.signal.aborted) {
          throw error;
        }
        throw new VoiceError("connection", "microphone-device", requestId);
      }

      if (this.#activeEpoch !== connectionEpoch) {
        stopStream(mediaStream);
        throw new VoiceError("connection", "request-aborted", requestId);
      }
      this.#mediaStream = mediaStream;

      const [microphoneTrack] = mediaStream.getAudioTracks();
      if (!microphoneTrack) {
        throw new VoiceError("connection", "microphone-device", requestId);
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
          this.#handleConnectionFailure("network", "connection");
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
          this.#handleConnectionFailure("network", "connection");
        }
      };
      this.#messageListener = messageListener;
      this.#unexpectedCloseListener = unexpectedCloseListener;
      dataChannel.addEventListener("message", messageListener);
      dataChannel.addEventListener("close", unexpectedCloseListener);
      dataChannel.addEventListener("error", unexpectedCloseListener);

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      const offerSdp = peerConnection.localDescription?.sdp ?? offer.sdp;
      if (!offerSdp) {
        throw new VoiceError("connection", "invalid-response", requestId);
      }

      let response: Response;
      try {
        response = await this.#dependencies.fetch("/api/voice/realtime-call", {
          body: offerSdp,
          headers: {
            "content-type": "application/sdp",
            [VOICE_REQUEST_ID_HEADER]: requestId,
          },
          method: "POST",
          signal: abortController.signal,
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          throw error;
        }
        throw new VoiceError("connection", "network", requestId);
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw voiceErrorFromResponse(response, "connection", requestId);
      }
      const contentType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();
      if (contentType !== "application/sdp") {
        await response.body?.cancel();
        throw new VoiceError("connection", "invalid-response", requestId);
      }
      let answerSdp: string;
      try {
        answerSdp = await response.text();
      } catch {
        throw new VoiceError("connection", "network", requestId);
      }
      if (!answerSdp.trim() || !answerSdp.trimStart().startsWith("v=0")) {
        throw new VoiceError("connection", "invalid-response", requestId);
      }

      try {
        await peerConnection.setRemoteDescription({
          sdp: answerSdp,
          type: "answer",
        });
      } catch {
        throw new VoiceError("connection", "invalid-response", requestId);
      }
      await this.#waitForDataChannelOpen(
        dataChannel,
        abortController.signal,
        requestId,
      );
      if (this.#activeEpoch !== connectionEpoch) {
        throw new VoiceError("connection", "request-aborted", requestId);
      }

      this.#connected = true;
      this.#connectedAt = this.#now();
      this.#reportDiagnostic("connection", requestId, startedAt, undefined);
      return connectionEpoch;
    } catch (error) {
      const voiceError =
        abortController.signal.reason === timeoutError
          ? new VoiceError("connection", "timeout", requestId)
          : error instanceof VoiceError
            ? error
            : abortController.signal.aborted ||
                (error instanceof DOMException && error.name === "AbortError")
              ? new VoiceError("connection", "request-aborted", requestId)
              : new VoiceError("connection", "invalid-response", requestId);
      if (this.#activeEpoch === connectionEpoch) {
        this.#releaseResources();
      }
      this.#reportDiagnostic(
        "connection",
        requestId,
        startedAt,
        voiceError.code,
      );
      throw voiceError;
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

  #handleConnectionFailure(
    code: VoiceErrorCode,
    operation: VoiceOperation,
  ): void {
    if (!this.#connected) {
      return;
    }
    const transcriptionTiming =
      operation === "transcription"
        ? this.#transcriptionTimings.values().next().value
        : undefined;
    const requestId =
      transcriptionTiming?.requestId ??
      this.#connectionRequestId ??
      this.#dependencies.createRequestId?.() ??
      createVoiceRequestId();
    if (operation === "transcription") {
      if (this.#transcriptionTimings.size === 0) {
        this.#reportDiagnostic(
          operation,
          requestId,
          this.#connectedAt ?? this.#now(),
          code,
        );
      } else {
        for (const timing of this.#transcriptionTimings.values()) {
          this.#reportDiagnostic(
            operation,
            timing.requestId,
            timing.startedAt,
            code,
          );
        }
        this.#transcriptionTimings.clear();
      }
    } else {
      this.#reportDiagnostic(
        operation,
        requestId,
        this.#connectedAt ?? this.#now(),
        code,
      );
    }
    this.#releaseResources();
    this.#emit({
      code,
      message: voiceErrorMessage(operation, code),
      requestId,
      type: "error",
    });
  }

  #handleMessage(event: MessageEvent<unknown>, connectionEpoch: number): void {
    const parsed = parseRealtimeEvent(event.data);
    if (!parsed || typeof parsed.type !== "string") {
      return;
    }

    if (
      parsed.type === "error" ||
      parsed.type === "conversation.item.input_audio_transcription.failed"
    ) {
      this.#handleConnectionFailure("invalid-response", "transcription");
      return;
    }

    if (parsed.type === "input_audio_buffer.committed") {
      if (typeof parsed.item_id !== "string" || !parsed.item_id) {
        return;
      }
      this.#startTranscription(parsed.item_id);
      this.setMicrophoneEnabled(false);
      this.#emit({
        connectionEpoch,
        itemId: parsed.item_id,
        type: "input-committed",
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
    if (transcriptEventType === null) {
      return;
    }
    if (
      typeof parsed.item_id !== "string" ||
      !parsed.item_id ||
      !Number.isInteger(parsed.content_index) ||
      (parsed.content_index as number) < 0
    ) {
      if (transcriptEventType === "completed") {
        this.#handleConnectionFailure("invalid-response", "transcription");
      }
      return;
    }

    this.#startTranscription(parsed.item_id);
    const text =
      transcriptEventType === "partial" ? parsed.delta : parsed.transcript;
    if (typeof text !== "string") {
      if (transcriptEventType === "completed") {
        this.#handleConnectionFailure("invalid-response", "transcription");
      }
      return;
    }
    if (transcriptEventType === "completed") {
      this.setMicrophoneEnabled(false);
      this.#finishTranscription(parsed.item_id);
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

  #now(): number {
    return this.#dependencies.now?.() ?? performance.now();
  }

  #reportDiagnostic(
    operation: VoiceOperation,
    requestId: string,
    startedAt: number,
    errorCode?: VoiceErrorCode,
  ): void {
    this.#dependencies.reportDiagnostic?.({
      durationMs: voiceDurationMs(startedAt, this.#now()),
      ...(errorCode === undefined ? {} : { errorCode }),
      operation,
      outcome: voiceDiagnosticOutcome(errorCode),
      requestId,
      stage: "browser",
    });
  }

  #startTranscription(itemId: string): void {
    if (!this.#transcriptionTimings.has(itemId)) {
      this.#transcriptionTimings.set(itemId, {
        requestId:
          this.#dependencies.createRequestId?.() ?? createVoiceRequestId(),
        startedAt: this.#now(),
      });
    }
  }

  #finishTranscription(itemId: string): void {
    const timing = this.#transcriptionTimings.get(itemId);
    if (!timing) {
      return;
    }
    this.#transcriptionTimings.delete(itemId);
    this.#reportDiagnostic("transcription", timing.requestId, timing.startedAt);
  }

  #releaseResources(): void {
    for (const timing of this.#transcriptionTimings.values()) {
      this.#reportDiagnostic(
        "transcription",
        timing.requestId,
        timing.startedAt,
        "request-aborted",
      );
    }
    this.#transcriptionTimings.clear();
    this.#activeEpoch = null;
    this.#connected = false;
    this.#connectedAt = null;
    this.#connectionRequestId = null;
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
      this.#dataChannel.removeEventListener(
        "error",
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
    requestId: string,
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
        dataChannel.removeEventListener("close", handleResult);
        signal.removeEventListener("abort", handleResult);

        if (event.type === "open") {
          resolve();
        } else if (event.type === "abort") {
          reject(new DOMException("Connection aborted", "AbortError"));
        } else {
          reject(new VoiceError("connection", "network", requestId));
        }
      };

      dataChannel.addEventListener("open", handleResult);
      dataChannel.addEventListener("error", handleResult);
      dataChannel.addEventListener("close", handleResult);
      signal.addEventListener("abort", handleResult, { once: true });
    });
  }
}
