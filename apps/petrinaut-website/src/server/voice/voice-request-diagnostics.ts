import {
  createVoiceRequestId,
  resolveVoiceRequestId,
  VOICE_ERROR_CODE_HEADER,
  VOICE_REQUEST_ID_HEADER,
  voiceDiagnosticOutcome,
  voiceDurationMs,
  type VoiceDiagnosticReporter,
  type VoiceErrorCode,
  type VoiceOperation,
} from "../../voice-diagnostics";

interface VoiceRequestDiagnosticDependencies {
  readonly createRequestId?: () => string;
  readonly now?: () => number;
  readonly reportDiagnostic?: VoiceDiagnosticReporter;
}

export const createVoiceRequestDiagnostics = (
  request: Request,
  operation: VoiceOperation,
  {
    createRequestId = createVoiceRequestId,
    now = () => performance.now(),
    reportDiagnostic,
  }: VoiceRequestDiagnosticDependencies = {},
) => {
  const requestId = resolveVoiceRequestId(
    request.headers.get(VOICE_REQUEST_ID_HEADER),
    createRequestId,
  );
  const startedAt = now();
  let finished = false;

  const elapsed = () => voiceDurationMs(startedAt, now());
  const decorate = (
    response: Response,
    errorCode?: VoiceErrorCode,
  ): Response => {
    response.headers.set(VOICE_REQUEST_ID_HEADER, requestId);
    if (errorCode !== undefined) {
      response.headers.set(VOICE_ERROR_CODE_HEADER, errorCode);
    }
    response.headers.append(
      "server-timing",
      `petrinaut_voice_${operation};dur=${elapsed()}`,
    );
    return response;
  };
  const finish = (status: number, errorCode?: VoiceErrorCode): void => {
    if (finished) {
      return;
    }
    finished = true;
    reportDiagnostic?.({
      durationMs: elapsed(),
      ...(errorCode === undefined ? {} : { errorCode }),
      operation,
      outcome:
        errorCode === undefined && status >= 400
          ? "failure"
          : voiceDiagnosticOutcome(errorCode),
      requestId,
      stage: "server",
      status,
    });
  };
  const respond = (
    response: Response,
    errorCode?: VoiceErrorCode,
  ): Response => {
    finish(response.status, errorCode);
    return decorate(response, errorCode);
  };

  return { decorate, finish, requestId, respond };
};
