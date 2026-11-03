/**
 * Whether a thrown value is the plain `error` event a `Worker` dispatches when
 * its script fails to load. Monaco rethrows it from a timer, and it carries no
 * message or stack. An error thrown inside a running worker arrives as an
 * `ErrorEvent` instead, so it does not match.
 */
export const isWorkerLoadFailure = (value: unknown): boolean =>
  typeof Worker !== "undefined" &&
  value instanceof Event &&
  Object.getPrototypeOf(value) === Event.prototype &&
  value.type === "error" &&
  value.target instanceof Worker;
