import type { HostNetMode, IframeToHostMessage } from "./messages";

type ReportSource = Extract<
  IframeToHostMessage,
  { kind: "reportError" }
>["source"];

let activeMode: HostNetMode | null = null;
let installed = false;

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
 * Posts a `reportError` message to the parent. No-op when the document is
 * loaded outside an iframe (so directly-visiting `/processes/<id>/embed`
 * doesn't recursively post errors to itself).
 */
const post = (source: ReportSource, raw: unknown) => {
  if (typeof window === "undefined" || window === window.parent) {
    return;
  }
  const message: IframeToHostMessage = {
    kind: "reportError",
    source,
    ...serializeError(raw),
    mode: activeMode,
  };
  /**
   * Target origin is "*" — see `use-iframe-bridge.ts` for why a stricter
   * value isn't readable from a null-origin sandbox.
   */
  window.parent.postMessage(message, "*");
};

/**
 * Idempotently wires `window.error` and `window.unhandledrejection`
 * listeners that forward into the host's Sentry SDK. Intended to be
 * called as early in the iframe document's lifetime as possible — see
 * `instrumentation-client.ts` which calls it before any application code.
 */
export const installIframeErrorReporter = (): void => {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;

  window.addEventListener("error", (event) => {
    /**
     * Prefer `event.error` (the actual Error object) over `event.message`,
     * but fall back to `message` for cross-origin script errors where
     * `event.error` is `null` ("Script error.").
     */
    post("window-error", event.error ?? event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    post("unhandled-rejection", event.reason);
  });
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
 * Forward an error caught by the embed app's React `ErrorBoundary`. The
 * boundary's `onError` callback is the right hook for this because by the
 * time `componentDidCatch` runs, the error has already been thrown out of
 * React's render path and `window.error` won't fire for it.
 */
export const reportIframeReactError = (error: unknown): void => {
  post("react", error);
};
