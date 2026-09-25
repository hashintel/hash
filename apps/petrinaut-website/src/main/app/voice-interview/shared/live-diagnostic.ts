/** Shared opt-in for readable console diagnostics and the held-utterance view. */
export const isVoiceDebugEnabled = (): boolean =>
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("voiceDebug") === "1";

/** Local development trace only. Pass explicit metadata, never payloads or text. */
export const logLiveDiagnostic = (
  event: string,
  metadata: Readonly<
    Record<string, string | number | boolean | null | undefined>
  >,
): void => {
  if (!import.meta.env.DEV) return;
  // Serialize now so DevTools cannot show later mutations as earlier state.
  // oxlint-disable-next-line no-console -- owner-requested, metadata-only local diagnosis.
  console.debug(
    `[Petrinaut Live trace] ${JSON.stringify({ at: new Date().toISOString(), event, ...metadata })}`,
  );

  if (!isVoiceDebugEnabled()) return;

  let status: string;
  switch (event) {
    case "input.finalized":
      status = "Transcript finalized";
      break;
    case "input.ignored":
      status = "Ignored by bridge";
      break;
    case "input.dropped":
      status = "Not submitted by bridge";
      break;
    case "judgment.result":
      if (metadata.mode === "log") {
        status = "Judgment only; submissions unchanged";
      } else if (metadata.applied === "withhold") {
        status = "Withheld by gate";
      } else if (metadata.timedOut === true) {
        status = "Submit allowed: judgment timed out (fail-open)";
      } else {
        status = "Submit allowed by gate";
      }
      break;
    case "judgment.released":
      status = "Manually released; awaiting submission";
      break;
    case "brunch.submit":
      status = "Submission attempted; awaiting admission";
      break;
    case "brunch.admitted":
      status = "Reached Brunch";
      break;
    case "brunch.unconfirmed":
      status = metadata.submissionId
        ? "Reached Brunch; response unconfirmed"
        : "Admission unconfirmed; check canonical history before retrying";
      break;
    default:
      return;
  }

  // Keep the readable view to known metadata; never copy arbitrary payloads.
  // oxlint-disable-next-line no-console -- opt-in, metadata-only local diagnosis.
  console.log(
    `[Petrinaut Voice debug] ${status} ${JSON.stringify({
      inputId: metadata.inputId,
      submissionId: metadata.submissionId,
      mode: metadata.mode,
      contribution: metadata.contribution,
      confidence: metadata.confidence,
      latencyMs: metadata.latencyMs,
      decision: metadata.decision,
      applied: metadata.applied,
      timedOut: metadata.timedOut,
    })}`,
  );
};
