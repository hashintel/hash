/**
 * Custom error class that includes an itemId to identify the SDCPN element
 * (place, transition, differential equation, etc.) where the error occurred.
 * This allows the UI to provide a "jump to item" feature when displaying errors.
 */
export class SDCPNItemError extends Error {
  public readonly itemId: string;

  constructor(message: string, itemId: string) {
    super(message);
    this.name = "SDCPNItemError";
    this.itemId = itemId;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, SDCPNItemError);
  }
}
