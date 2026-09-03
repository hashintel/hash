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
export type VoiceOperation =
  | "connection"
  | "preparation"
  | "transcription"
  | "speech";

export interface VoiceDiagnosticEvent {
  readonly durationMs: number;
  readonly errorCode?: VoiceErrorCode;
  readonly inputWordCount?: number;
  readonly operation: VoiceOperation;
  readonly outcome: "success" | "failure" | "aborted";
  readonly outputWordCount?: number;
  readonly requestId: string;
  readonly sourceSegmentCount?: number;
  readonly stage: "browser" | "playback" | "server";
  readonly status?: number;
}

export type VoiceDiagnosticReporter = (event: VoiceDiagnosticEvent) => void;

const serverVoiceErrorCodes = [
  "request-aborted",
  "network",
  "timeout",
  "invalid-response",
  "unavailable",
] as const satisfies readonly VoiceErrorCode[];

export const createVoiceRequestId = (): string => crypto.randomUUID();

const isAsciiHexadecimalDigit = (character: string): boolean => {
  const codePoint = character.charCodeAt(0);
  return (
    (codePoint >= 48 && codePoint <= 57) ||
    (codePoint >= 65 && codePoint <= 70) ||
    (codePoint >= 97 && codePoint <= 102)
  );
};

const isVoiceRequestId = (value: string): boolean => {
  if (
    value.length !== 36 ||
    value[8] !== "-" ||
    value[13] !== "-" ||
    value[14] !== "4" ||
    value[18] !== "-" ||
    value[23] !== "-" ||
    !["8", "9", "a", "b"].includes(value[19]?.toLowerCase() ?? "")
  ) {
    return false;
  }

  for (let index = 0; index < value.length; index++) {
    if (index === 8 || index === 13 || index === 18 || index === 23) {
      continue;
    }
    if (!isAsciiHexadecimalDigit(value[index]!)) {
      return false;
    }
  }

  return true;
};

export const resolveVoiceRequestId = (
  value: string | null | undefined,
  createRequestId: () => string = createVoiceRequestId,
): string =>
  value !== null && value !== undefined && isVoiceRequestId(value)
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
    responseRequestId !== null && isVoiceRequestId(responseRequestId)
      ? responseRequestId
      : fallbackRequestId,
  );
};
