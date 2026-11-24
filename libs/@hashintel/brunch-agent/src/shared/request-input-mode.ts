import type { BrunchInputMode } from "@hashintel/brunch-agent";

/**
 * The panel's input mode when it sent a request, carried in the request body
 * so the transport reads the mode the panel holds at that moment.
 */
export const withRequestInputMode = (
  body: object | undefined,
  inputMode: BrunchInputMode,
): object => ({ ...body, inputMode });

/** A request without a mode was not sent from Voice, so it counts as text. */
export const readRequestInputMode = (
  body: object | undefined,
): BrunchInputMode =>
  body !== undefined && "inputMode" in body && body.inputMode === "voice"
    ? "voice"
    : "text";
