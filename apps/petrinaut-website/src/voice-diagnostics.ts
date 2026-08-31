export const VOICE_ERROR_CODE_HEADER = "x-petrinaut-voice-error";
export const VOICE_REQUEST_ID_HEADER = "x-request-id";

export const voiceErrorCodes = [
  "microphone-permission",
  "microphone-device",
  "request-aborted",
  "network",
  "timeout",
  "invalid-response",
  "unavailable",
] as const;

export type VoiceErrorCode = (typeof voiceErrorCodes)[number];
export type VoiceOperation = "connection" | "transcription" | "speech";

export interface VoiceDiagnosticEvent {
  readonly durationMs: number;
  readonly errorCode?: VoiceErrorCode;
  readonly operation: VoiceOperation;
  readonly outcome: "success" | "failure" | "aborted";
  readonly requestId: string;
  readonly stage: "browser" | "playback" | "server";
  readonly status?: number;
}

export type VoiceDiagnosticReporter = (event: VoiceDiagnosticEvent) => void;

const voiceRequestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const serverVoiceErrorCodes = [
  "request-aborted",
  "network",
  "timeout",
  "invalid-response",
  "unavailable",
] as const satisfies readonly VoiceErrorCode[];

export const createVoiceRequestId = (): string => crypto.randomUUID();

export const resolveVoiceRequestId = (
  value: string | null | undefined,
  createRequestId: () => string = createVoiceRequestId,
): string =>
  value !== null && value !== undefined && voiceRequestIdPattern.test(value)
    ? value
    : createRequestId();

export const voiceDurationMs = (
  startedAt: number,
  finishedAt: number,
): number => Math.max(0, Math.round((finishedAt - startedAt) * 10) / 10);

export const voiceDiagnosticOutcome = (
  errorCode?: VoiceErrorCode,
): VoiceDiagnosticEvent["outcome"] =>
  errorCode === undefined
    ? "success"
    : errorCode === "request-aborted"
      ? "aborted"
      : "failure";

export const reportVoiceDiagnostic: VoiceDiagnosticReporter = (event) => {
  // The event type permits scalar operational metadata only. Never add
  // provider payloads, SDP, audio, prompts, or spoken/transcribed text here.
  // oxlint-disable-next-line no-console -- preview diagnostics use the website's existing runtime logger.
  console.info("[Petrinaut voice]", JSON.stringify(event));
};

const isServerVoiceErrorCode = (
  value: unknown,
): value is (typeof serverVoiceErrorCodes)[number] =>
  typeof value === "string" &&
  (serverVoiceErrorCodes as readonly string[]).includes(value);

export const voiceErrorMessage = (
  operation: VoiceOperation,
  code: VoiceErrorCode,
): string => {
  if (code === "microphone-permission") {
    return "Allow microphone access in your browser settings, then reconnect voice input.";
  }
  if (code === "microphone-device") {
    return "No usable microphone was found. Connect or select one, then reconnect voice input.";
  }

  const visibleTextFallback =
    operation === "speech" ? " Read the visible response instead." : "";
  const reconnect =
    operation === "speech"
      ? ""
      : " Check your connection, then reconnect voice input.";
  const subject =
    operation === "connection" ? "voice connection" : `${operation} service`;

  switch (code) {
    case "request-aborted":
      return `The ${subject} request was interrupted.${visibleTextFallback}${reconnect}`;
    case "network":
      return `The ${subject} could not be reached.${visibleTextFallback}${reconnect}`;
    case "timeout":
      return `The ${subject} timed out.${visibleTextFallback}${reconnect}`;
    case "invalid-response":
      return `The ${subject} returned an invalid response.${visibleTextFallback} Try again; if it continues, give the diagnostic reference to an operator.`;
    case "unavailable":
      return `The ${subject} preview is unavailable or disabled.${visibleTextFallback} Continue with the text composer.`;
  }
};

export class VoiceError extends Error {
  public readonly code: VoiceErrorCode;
  public readonly requestId: string;

  public constructor(
    operation: VoiceOperation,
    code: VoiceErrorCode,
    requestId: string,
  ) {
    super(voiceErrorMessage(operation, code));
    this.name = "VoiceError";
    this.code = code;
    this.requestId = requestId;
  }
}

export const voiceErrorFromResponse = (
  response: Response,
  operation: VoiceOperation,
  fallbackRequestId: string,
): VoiceError => {
  const headerCode = response.headers.get(VOICE_ERROR_CODE_HEADER);
  const code = isServerVoiceErrorCode(headerCode)
    ? headerCode
    : response.status === 404
      ? "unavailable"
      : response.status === 504
        ? "timeout"
        : "invalid-response";
  const responseRequestId = response.headers.get(VOICE_REQUEST_ID_HEADER);
  return new VoiceError(
    operation,
    code,
    responseRequestId !== null && voiceRequestIdPattern.test(responseRequestId)
      ? responseRequestId
      : fallbackRequestId,
  );
};
