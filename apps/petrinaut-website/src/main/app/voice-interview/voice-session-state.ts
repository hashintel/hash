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
  // Muting only replaces the user's own turn. While the assistant speaks or
  // works, what it is doing is the more useful thing to report.
  if (!snapshot.microphoneEnabled) {
    return "muted";
  }

  return "listening";
};

/**
 * Maps a provider snapshot onto the state Petrinaut renders its Voice surfaces
 * from. Returns `null` when no session is running.
 */
export const toVoiceSessionState = ({
  snapshot,
}: {
  readonly snapshot: VoiceTurnSnapshot;
}): PetrinautAiVoiceSessionState | null => {
  if (snapshot.connection === "idle") {
    return null;
  }

  return {
    errorMessage:
      snapshot.connection === "error" ? errorMessageOf(snapshot) : null,
    microphoneMuted:
      snapshot.connection === "connected" &&
      snapshot.input !== "paused" &&
      !snapshot.microphoneEnabled,
    microphoneLevel: snapshot.microphoneLevel,
    phase: phaseOf(snapshot),
  };
};
