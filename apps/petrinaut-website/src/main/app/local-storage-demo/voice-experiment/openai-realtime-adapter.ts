import type { VoiceExperimentAdapter } from "./voice-experiment-adapter";
import type { VoiceExperimentEvent } from "./voice-experiment-events";

const SESSION_ENDPOINT = "/api/voice-experiment/openai-realtime-session";
const REALTIME_CALLS_ENDPOINT = "https://api.openai.com/v1/realtime/calls";
const CONNECTION_TIMEOUT_MS = 20_000;
const WAIT_FOR_USER_TOOL_NAME = "wait_for_user";
const DUMMY_TOOL_NAMES = new Set([
  "record_process_decision",
  "record_process_flow",
  "record_process_step",
  "record_process_state",
  "record_model_requirement",
  WAIT_FOR_USER_TOOL_NAME,
]);

type OpenAIRealtimeAdapterDependencies = {
  createAudioElement: () => HTMLAudioElement;
  createPeerConnection: () => RTCPeerConnection;
  fetch: typeof globalThis.fetch;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  now: () => number;
};

type RealtimeEvent = {
  type: string;
  [key: string]: unknown;
};

type FunctionCall = {
  arguments: string | null;
  callId: string;
  name: string;
};

const defaultDependencies: OpenAIRealtimeAdapterDependencies = {
  createAudioElement: () => document.createElement("audio"),
  createPeerConnection: () => new RTCPeerConnection(),
  fetch: (...args) => globalThis.fetch(...args),
  getUserMedia: (constraints) =>
    navigator.mediaDevices.getUserMedia(constraints),
  now: () => Date.now(),
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const getString = (
  value: Record<string, unknown> | null,
  key: string,
): string | null => {
  const candidate = value?.[key];
  return typeof candidate === "string" ? candidate : null;
};

const parseServerEvent = (data: unknown): RealtimeEvent | null => {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as unknown;
    const record = asRecord(parsed);
    return record && typeof record.type === "string"
      ? (record as RealtimeEvent)
      : null;
  } catch {
    return null;
  }
};

const boundedSummaryText = (value: unknown, limit = 120): string => {
  if (typeof value !== "string") {
    return "";
  }
  let sanitized = "";
  for (const character of value.normalize("NFKC")) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint >= 32 && codePoint !== 127) {
      sanitized += character;
    }
  }
  return sanitized.replace(/\s+/gu, " ").trim().slice(0, limit);
};

const summarizeFunctionCall = ({
  arguments: serializedArguments,
  name,
}: FunctionCall): string => {
  if (name === WAIT_FOR_USER_TOOL_NAME) {
    return "Silent no-op";
  }

  if (!serializedArguments) {
    return "Arguments unavailable";
  }

  let input: Record<string, unknown> | null = null;
  try {
    input = asRecord(JSON.parse(serializedArguments));
  } catch {
    return "Arguments unavailable";
  }

  if (name === "record_process_state") {
    const nameSummary = boundedSummaryText(input?.name);
    const category = boundedSummaryText(input?.category);
    const description = boundedSummaryText(input?.description);
    const parts = [
      nameSummary,
      category ? `Type: ${category}` : "",
      description,
    ];
    return (
      parts.filter(Boolean).join(" · ").slice(0, 240) || "Arguments unavailable"
    );
  }

  if (name === "record_process_step") {
    const parts = [
      boundedSummaryText(input?.name),
      boundedSummaryText(input?.description),
    ];
    const owner = boundedSummaryText(input?.owner);
    if (owner) {
      parts.push(`Owner: ${owner}`);
    }
    return (
      parts.filter(Boolean).join(" · ").slice(0, 240) || "Arguments unavailable"
    );
  }

  if (name === "record_process_decision") {
    const condition = boundedSummaryText(input?.condition);
    const outcomes = Array.isArray(input?.outcomes)
      ? input.outcomes
          .slice(0, 4)
          .map((outcome) => boundedSummaryText(outcome, 80))
          .filter(Boolean)
          .join(" / ")
      : "";
    const parts = [
      condition ? `Condition: ${condition}` : "",
      outcomes ? `Outcomes: ${outcomes}` : "",
    ];
    return (
      parts.filter(Boolean).join(" · ").slice(0, 240) || "Arguments unavailable"
    );
  }

  if (name === "record_process_flow") {
    const from = boundedSummaryText(input?.from);
    const to = boundedSummaryText(input?.to);
    const condition = boundedSummaryText(input?.condition);
    const parts = [
      from && to ? `${from} → ${to}` : from || to,
      condition ? `Condition: ${condition}` : "",
    ];
    return (
      parts.filter(Boolean).join(" · ").slice(0, 240) || "Arguments unavailable"
    );
  }

  if (name === "record_model_requirement") {
    const category = boundedSummaryText(input?.category);
    const description = boundedSummaryText(input?.description);
    const parts = [category ? `Type: ${category}` : "", description];
    return (
      parts.filter(Boolean).join(" · ").slice(0, 240) || "Arguments unavailable"
    );
  }

  return "Arguments hidden";
};

class OpenAIRealtimeAdapter implements VoiceExperimentAdapter {
  readonly #dependencies: OpenAIRealtimeAdapterDependencies;
  readonly #listeners = new Set<(event: VoiceExperimentEvent) => void>();
  readonly #transcriptByItemId = new Map<string, string>();
  readonly #turnByItemId = new Map<string, number>();

  #audioElement: HTMLAudioElement | null = null;
  #connectAbortController: AbortController | null = null;
  #connectPromise: Promise<void> | null = null;
  #connected = false;
  #dataChannel: RTCDataChannel | null = null;
  #isReleasingResources = false;
  #latestAssistantTranscript = "";
  #latestTurnId = 0;
  #mediaStream: MediaStream | null = null;
  #microphoneTrack: MediaStreamTrack | null = null;
  #peerConnection: RTCPeerConnection | null = null;
  #pendingCommittedTurnId: number | null = null;
  #responseInProgress = false;
  #turnId = 0;

  public constructor(dependencies: OpenAIRealtimeAdapterDependencies) {
    this.#dependencies = dependencies;
  }

  public subscribe(listener: (event: VoiceExperimentEvent) => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public async connect(): Promise<void> {
    if (this.#connected) {
      return;
    }

    if (this.#connectPromise) {
      return this.#connectPromise;
    }

    this.#connectPromise = this.#establishConnection().finally(() => {
      this.#connectPromise = null;
    });

    return this.#connectPromise;
  }

  public async startTurn(): Promise<void> {
    const dataChannel = this.#requireOpenDataChannel();
    const microphoneTrack = this.#microphoneTrack;
    if (!microphoneTrack) {
      throw new Error("The microphone is not available.");
    }
    if (microphoneTrack.enabled) {
      return;
    }

    this.#turnId += 1;
    this.#latestTurnId = this.#turnId;
    this.#latestAssistantTranscript = "";

    this.#send(dataChannel, { type: "input_audio_buffer.clear" });
    if (this.#responseInProgress) {
      this.#send(dataChannel, { type: "response.cancel" });
      this.#send(dataChannel, { type: "output_audio_buffer.clear" });
      this.#responseInProgress = false;
    }

    microphoneTrack.enabled = true;
    this.#emit({
      timestampMs: this.#dependencies.now(),
      turnId: this.#turnId,
      type: "recording-started",
    });
  }

  public async finishTurn(): Promise<void> {
    const dataChannel = this.#requireOpenDataChannel();
    const microphoneTrack = this.#microphoneTrack;
    if (!microphoneTrack?.enabled) {
      return;
    }

    microphoneTrack.enabled = false;
    this.#pendingCommittedTurnId = this.#turnId;
    this.#send(dataChannel, { type: "input_audio_buffer.commit" });
    this.#send(dataChannel, { type: "response.create" });
  }

  public async dispose(): Promise<void> {
    this.#connectAbortController?.abort();
    this.#releaseResources();
  }

  async #establishConnection(): Promise<void> {
    const abortController = new AbortController();
    this.#connectAbortController = abortController;
    const timeout = globalThis.setTimeout(
      () => abortController.abort(),
      CONNECTION_TIMEOUT_MS,
    );

    try {
      const tokenResponse = await this.#dependencies.fetch(SESSION_ENDPOINT, {
        method: "POST",
        headers: { "x-voice-experiment": "openai-realtime" },
        signal: abortController.signal,
      });
      if (!tokenResponse.ok) {
        throw new Error("The voice session could not be started.");
      }

      const tokenBody = asRecord(await tokenResponse.json());
      const clientSecret = getString(tokenBody, "clientSecret");
      if (!clientSecret) {
        throw new Error("The voice session returned an invalid client secret.");
      }

      const peerConnection = this.#dependencies.createPeerConnection();
      this.#peerConnection = peerConnection;

      const audioElement = this.#dependencies.createAudioElement();
      audioElement.autoplay = true;
      this.#audioElement = audioElement;
      peerConnection.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream && this.#audioElement) {
          this.#audioElement.srcObject = stream;
        }
      };
      peerConnection.onconnectionstatechange = () => {
        if (
          peerConnection.connectionState === "failed" &&
          !this.#isReleasingResources
        ) {
          this.#emitError("The realtime audio connection failed.");
        }
      };

      const mediaStream = await this.#dependencies.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      this.#mediaStream = mediaStream;
      const [microphoneTrack] = mediaStream.getAudioTracks();
      if (!microphoneTrack) {
        throw new Error("No microphone audio track was available.");
      }
      microphoneTrack.enabled = false;
      this.#microphoneTrack = microphoneTrack;
      peerConnection.addTrack(microphoneTrack, mediaStream);

      const dataChannel = peerConnection.createDataChannel("oai-events");
      this.#dataChannel = dataChannel;
      dataChannel.addEventListener("message", this.#handleMessage);
      dataChannel.addEventListener("close", this.#handleUnexpectedClose);

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      if (!offer.sdp) {
        throw new Error("The browser could not create a realtime audio offer.");
      }

      const sdpResponse = await this.#dependencies.fetch(
        REALTIME_CALLS_ENDPOINT,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${clientSecret}`,
            "content-type": "application/sdp",
          },
          body: offer.sdp,
          signal: abortController.signal,
        },
      );
      if (!sdpResponse.ok) {
        throw new Error("OpenAI could not establish the realtime audio call.");
      }

      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text(),
      });
      await this.#waitForDataChannelOpen(dataChannel, abortController.signal);

      this.#connected = true;
      this.#emit({
        timestampMs: this.#dependencies.now(),
        type: "connected",
      });
    } catch (error) {
      this.#releaseResources();
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("The realtime audio connection timed out.");
      }
      throw error;
    } finally {
      globalThis.clearTimeout(timeout);
      if (this.#connectAbortController === abortController) {
        this.#connectAbortController = null;
      }
    }
  }

  #waitForDataChannelOpen(
    dataChannel: RTCDataChannel,
    signal: AbortSignal,
  ): Promise<void> {
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
          reject(new Error("The realtime event channel failed to open."));
        }
      };

      dataChannel.addEventListener("open", handleResult);
      dataChannel.addEventListener("error", handleResult);
      signal.addEventListener("abort", handleResult);
    });
  }

  readonly #handleMessage = (message: MessageEvent<unknown>) => {
    const event = parseServerEvent(message.data);
    if (!event) {
      this.#emitError("OpenAI sent an unreadable realtime event.");
      return;
    }

    if (event.type === "input_audio_buffer.committed") {
      const itemId = getString(event, "item_id");
      if (itemId) {
        if (this.#pendingCommittedTurnId !== null) {
          this.#turnByItemId.set(itemId, this.#pendingCommittedTurnId);
          this.#pendingCommittedTurnId = null;
        } else {
          if (this.#turnByItemId.size > 0) {
            this.#turnId += 1;
            this.#latestTurnId = this.#turnId;
            this.#latestAssistantTranscript = "";
          }
          this.#turnByItemId.set(itemId, this.#latestTurnId);
        }
      }
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.delta") {
      this.#handleTranscriptDelta(event, "expert");
      return;
    }

    if (
      event.type === "conversation.item.input_audio_transcription.completed"
    ) {
      this.#handleTranscriptCompleted(event, "expert");
      return;
    }

    if (event.type === "response.created") {
      this.#responseInProgress = true;
      this.#emit({
        timestampMs: this.#dependencies.now(),
        turnId: this.#latestTurnId,
        type: "response-started",
      });
      return;
    }

    if (event.type === "response.output_audio_transcript.delta") {
      this.#handleTranscriptDelta(event, "assistant");
      return;
    }

    if (event.type === "response.output_audio_transcript.done") {
      this.#handleTranscriptCompleted(event, "assistant");
      return;
    }

    if (event.type === "response.done") {
      this.#handleResponseDone(event);
      return;
    }

    if (event.type === "error") {
      const error = asRecord(event.error);
      this.#emitError(
        getString(error, "message") ??
          "The realtime session returned an error.",
      );
    }
  };

  #handleTranscriptDelta(
    event: RealtimeEvent,
    speaker: "assistant" | "expert",
  ) {
    const delta = getString(event, "delta");
    const itemId = getString(event, "item_id");
    if (!delta || !itemId) {
      return;
    }

    const transcript = `${this.#transcriptByItemId.get(itemId) ?? ""}${delta}`;
    this.#transcriptByItemId.set(itemId, transcript);
    if (speaker === "assistant") {
      this.#latestAssistantTranscript = transcript;
    }

    this.#emit({
      speaker,
      timestampMs: this.#dependencies.now(),
      transcript,
      turnId: this.#getTurnId(itemId),
      type: "partial-transcript",
    });
  }

  #handleTranscriptCompleted(
    event: RealtimeEvent,
    speaker: "assistant" | "expert",
  ) {
    const itemId = getString(event, "item_id");
    if (!itemId) {
      return;
    }

    const transcript =
      getString(event, "transcript") ??
      this.#transcriptByItemId.get(itemId) ??
      "";
    this.#transcriptByItemId.set(itemId, transcript);
    if (speaker === "assistant") {
      this.#latestAssistantTranscript = transcript;
    }

    this.#emit({
      speaker,
      timestampMs: this.#dependencies.now(),
      transcript,
      turnId: this.#getTurnId(itemId),
      type: "final-transcript",
    });
  }

  #handleResponseDone(event: RealtimeEvent) {
    this.#responseInProgress = false;
    const response = asRecord(event.response);
    const status = getString(response, "status");
    if (status === "cancelled") {
      return;
    }

    const functionCalls = this.#getFunctionCalls(response?.output);
    if (functionCalls.length > 0) {
      const dataChannel = this.#dataChannel;
      if (!dataChannel || dataChannel.readyState !== "open") {
        this.#emitError("The tool result could not be returned.");
        return;
      }

      for (const functionCall of functionCalls) {
        const isWaitForUser = functionCall.name === WAIT_FOR_USER_TOOL_NAME;
        this.#emit({
          argumentSummary: summarizeFunctionCall(functionCall),
          callId: functionCall.callId,
          timestampMs: this.#dependencies.now(),
          toolName: functionCall.name,
          turnId: this.#latestTurnId,
          type: "tool-called",
        });
        this.#send(dataChannel, {
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: functionCall.callId,
            output: JSON.stringify(
              isWaitForUser
                ? { mode: "experiment-only", waited: true }
                : {
                    mode: "experiment-only",
                    recorded: DUMMY_TOOL_NAMES.has(functionCall.name),
                  },
            ),
          },
        });
      }

      if (
        functionCalls.some(
          (functionCall) => functionCall.name !== WAIT_FOR_USER_TOOL_NAME,
        )
      ) {
        this.#send(dataChannel, { type: "response.create" });
        this.#responseInProgress = true;
      } else {
        this.#emit({
          timestampMs: this.#dependencies.now(),
          turnId: this.#latestTurnId,
          type: "response-completed",
        });
      }
      return;
    }

    if (status && status !== "completed") {
      this.#emitError("The realtime response did not complete.");
      return;
    }

    this.#emit({
      ...(this.#latestAssistantTranscript
        ? { responseText: this.#latestAssistantTranscript }
        : {}),
      timestampMs: this.#dependencies.now(),
      turnId: this.#latestTurnId,
      type: "response-completed",
    });
  }

  #getFunctionCalls(output: unknown): FunctionCall[] {
    if (!Array.isArray(output)) {
      return [];
    }

    return output.flatMap((item) => {
      const record = asRecord(item);
      if (getString(record, "type") !== "function_call") {
        return [];
      }
      const callId = getString(record, "call_id");
      const name = getString(record, "name");
      return callId && name
        ? [{ arguments: getString(record, "arguments"), callId, name }]
        : [];
    });
  }

  #getTurnId(itemId: string): number {
    return this.#turnByItemId.get(itemId) ?? this.#latestTurnId;
  }

  #requireOpenDataChannel(): RTCDataChannel {
    const dataChannel = this.#dataChannel;
    if (!this.#connected || !dataChannel || dataChannel.readyState !== "open") {
      throw new Error("Start the voice session before recording a turn.");
    }
    return dataChannel;
  }

  #send(dataChannel: RTCDataChannel, event: Record<string, unknown>) {
    dataChannel.send(JSON.stringify(event));
  }

  #emit(event: VoiceExperimentEvent) {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }

  #emitError(message: string) {
    this.#emit({
      message,
      timestampMs: this.#dependencies.now(),
      type: "error",
    });
  }

  readonly #handleUnexpectedClose = () => {
    if (this.#connected && !this.#isReleasingResources) {
      this.#connected = false;
      this.#emitError("The realtime event channel closed unexpectedly.");
    }
  };

  #releaseResources() {
    this.#isReleasingResources = true;
    this.#connected = false;
    this.#responseInProgress = false;

    const dataChannel = this.#dataChannel;
    this.#dataChannel = null;
    if (dataChannel) {
      dataChannel.removeEventListener("message", this.#handleMessage);
      dataChannel.removeEventListener("close", this.#handleUnexpectedClose);
      dataChannel.close();
    }

    const mediaStream = this.#mediaStream;
    this.#mediaStream = null;
    this.#microphoneTrack = null;
    for (const track of mediaStream?.getTracks() ?? []) {
      track.stop();
    }

    const audioElement = this.#audioElement;
    this.#audioElement = null;
    if (audioElement) {
      audioElement.pause();
      audioElement.srcObject = null;
    }

    const peerConnection = this.#peerConnection;
    this.#peerConnection = null;
    if (peerConnection) {
      peerConnection.onconnectionstatechange = null;
      peerConnection.ontrack = null;
      peerConnection.close();
    }

    this.#transcriptByItemId.clear();
    this.#turnByItemId.clear();
    this.#pendingCommittedTurnId = null;
    this.#isReleasingResources = false;
  }
}

export const createOpenAIRealtimeAdapter = (
  dependencies: Partial<OpenAIRealtimeAdapterDependencies> = {},
): VoiceExperimentAdapter =>
  new OpenAIRealtimeAdapter({ ...defaultDependencies, ...dependencies });
