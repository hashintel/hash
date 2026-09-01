import type { VoiceTurnSnapshot } from "./voice-turn-controller";
import type { PetrinautAiVoiceSessionState } from "@hashintel/petrinaut/ui";

type RecoveryErrorFamily = "connection" | "microphone" | "voice";

const recoveryErrorFamily = (
  errorCode: VoiceTurnSnapshot["errorCode"],
): RecoveryErrorFamily => {
  switch (errorCode) {
    case "microphone-permission":
    case "microphone-device":
      return "microphone";
    case "network":
    case "timeout":
    case "request-aborted":
      return "connection";
    default:
      return "voice";
  }
};

const errorHeadline = (errorCode: VoiceTurnSnapshot["errorCode"]): string => {
  switch (recoveryErrorFamily(errorCode)) {
    case "connection":
      return "Connection interrupted";
    case "microphone":
      return "Microphone unavailable";
    case "voice":
      return "Voice interrupted";
  }
};

/**
 * Petrinaut shows this in a toast, so the diagnostic identifiers that used to
 * sit behind a "Technical details" disclosure are folded into one sentence.
 */
const errorMessageOf = (snapshot: VoiceTurnSnapshot): string => {
  const headline = errorHeadline(snapshot.errorCode);
  const detail = snapshot.errorMessage
    ? `${headline}. ${snapshot.errorMessage}`
    : headline;
  const references = [snapshot.errorCode, snapshot.errorRequestId].filter(
    (reference): reference is string =>
      typeof reference === "string" && reference.length > 0,
  );

  return references.length === 0
    ? detail
    : `${detail} (${references.join(" · ")})`;
};

const phaseOf = (
  snapshot: VoiceTurnSnapshot,
): PetrinautAiVoiceSessionState["phase"] => {
  if (snapshot.connection === "connecting") {
    return "connecting";
  }
  if (snapshot.connection === "error") {
    return "error";
  }
  if (snapshot.input === "paused") {
    return "paused";
  }
  if (snapshot.output === "speaking") {
    return "speaking";
  }
  if (
    snapshot.output === "waiting-for-tool" ||
    snapshot.input === "submitting"
  ) {
    return "thinking";
  }

  return "listening";
};

/**
 * The caption follows whichever side holds the turn: the user's speech as it
 * is transcribed, then the question the interviewer speaks back.
 */
const captionOf = (
  snapshot: VoiceTurnSnapshot,
  committedTextRepresented: boolean,
): string => {
  if (snapshot.partialText) {
    return snapshot.partialText;
  }

  if (snapshot.output === "speaking") {
    return snapshot.currentQuestion;
  }

  // A finalized answer that Petrinaut has not yet echoed into the transcript
  // stays on screen, so the turn never looks lost between the two surfaces.
  const answerPending =
    snapshot.lastAnswerDelivery === "pending" ||
    snapshot.lastAnswerDelivery === "failed";

  return answerPending && !committedTextRepresented
    ? snapshot.lastCommittedText
    : "";
};

/**
 * Maps a provider snapshot onto the state Petrinaut renders its Voice surfaces
 * from. Returns `null` when no session is running.
 */
export const toVoiceSessionState = ({
  committedTextRepresented,
  snapshot,
}: {
  readonly committedTextRepresented: boolean;
  readonly snapshot: VoiceTurnSnapshot;
}): PetrinautAiVoiceSessionState | null => {
  if (snapshot.connection === "idle") {
    return null;
  }

  return {
    caption: captionOf(snapshot, committedTextRepresented),
    errorMessage:
      snapshot.connection === "error" ? errorMessageOf(snapshot) : null,
    microphoneLevel: snapshot.microphoneLevel,
    phase: phaseOf(snapshot),
  };
};
