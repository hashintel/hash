import type { HostNetMode, IframeToHostMessage } from "../shared/messages";
import type { ErrorTrackerCaptureContext } from "@hashintel/petrinaut";

type ReportError = Extract<IframeToHostMessage, { kind: "reportError" }>;

let activeMode: HostNetMode | null = null;

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
};

const serializeError = (
  raw: unknown,
): { name: string; message: string; stack: string | undefined } => {
  if (raw instanceof Error) {
    return { name: raw.name, message: raw.message, stack: raw.stack };
  }
  if (typeof raw === "string") {
    return { name: "Error", message: raw, stack: undefined };
  }
  if (raw === null || raw === undefined) {
    return { name: "Error", message: String(raw), stack: undefined };
  }
  return { name: "Error", message: safeStringify(raw), stack: undefined };
};

/**
 * Posts a `reportError` message to the host, which listens on this window.
 */
const post = (
  source: ReportError["source"],
  raw: unknown,
  tags?: ReportError["tags"],
) => {
  if (typeof window === "undefined") {
    return;
  }
  const message: IframeToHostMessage = {
    kind: "reportError",
    source,
    ...serializeError(raw),
    mode: activeMode,
    tags,
  };
  window.postMessage(message, window.location.origin);
};

/**
 * Records the active net mode so subsequent error reports include it. The
 * iframe bridge calls this in response to `init` / `load` messages so the
 * host can tag Sentry events with which net the user was editing when
 * the error fired.
 */
export const setIframeErrorReporterMode = (mode: HostNetMode | null): void => {
  activeMode = mode;
};

/**
 * Forward an error Petrinaut caught itself, such as a failing plugin's, with
 * the tags it attached and its `source` as the `petrinaut.origin` tag.
 * Petrinaut's boundaries keep these from the app's `ErrorBoundary`.
 */
export const reportIframePetrinautError = (
  error: unknown,
  context?: ErrorTrackerCaptureContext,
): void => {
  post(
    "petrinaut",
    error,
    context?.source === undefined
      ? context?.tags
      : { ...context.tags, "petrinaut.origin": context.source },
  );
};
