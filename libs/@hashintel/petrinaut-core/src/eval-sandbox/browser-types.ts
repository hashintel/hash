/**
 * Minimal browser-global shapes used by the iframe sandbox.
 *
 * `petrinaut-core` deliberately does not depend on the DOM `lib` so it
 * stays usable from non-browser hosts (Node tests, worker bundles).
 * The iframe sandbox files run only in the browser; the structural
 * declarations here cover what they need without dragging in the full
 * `lib.dom.d.ts`. Real `Window` / `MessageEvent` shapes structurally
 * satisfy these interfaces when consumers compile with DOM types.
 */

/** Minimal shape of a frame's `Window` we postMessage into. */
export interface SandboxIframeWindow {
  postMessage(message: unknown, targetOrigin: string): void;
}

/** Minimal shape of a `MessageEvent` arriving on the parent's window. */
export interface SandboxMessageEvent {
  readonly source: unknown;
  readonly data: unknown;
}

/** Minimal shape of an `ErrorEvent` arriving inside the iframe. */
export interface SandboxErrorEvent {
  readonly error?: unknown;
  readonly message?: string;
}

/** Minimal shape of a `PromiseRejectionEvent` arriving inside the iframe. */
export interface SandboxPromiseRejectionEvent {
  readonly reason: unknown;
}

/**
 * Parent-side global handle. The parent listens on its own window's
 * `message` channel and filters by `event.source === iframeWindow`.
 */
export interface SandboxParentGlobal {
  addEventListener(
    type: "message",
    listener: (event: SandboxMessageEvent) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: SandboxMessageEvent) => void,
  ): void;
}

/**
 * In-iframe global handle. Iframe code postMessages to `parent` and
 * listens on its own window for parent requests, plus error/rejection
 * channels.
 */
export interface SandboxIframeGlobal {
  readonly parent: SandboxIframeWindow;
  addEventListener(
    type: "message",
    listener: (event: SandboxMessageEvent) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: SandboxMessageEvent) => void,
  ): void;
  addEventListener(
    type: "error",
    listener: (event: SandboxErrorEvent) => void,
  ): void;
  removeEventListener(
    type: "error",
    listener: (event: SandboxErrorEvent) => void,
  ): void;
  addEventListener(
    type: "unhandledrejection",
    listener: (event: SandboxPromiseRejectionEvent) => void,
  ): void;
  removeEventListener(
    type: "unhandledrejection",
    listener: (event: SandboxPromiseRejectionEvent) => void,
  ): void;
}
