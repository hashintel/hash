/**
 * Defines a logical status and error model that is suitable for different programming environments, including REST APIs
 * and RPC APIs.
 */

import { StatusCode } from "./status-code";

export { type StatusCode } from "./status-code";

/**
 * The canonical shape of a response object describing the status of a request between services.
 */
export type Status<D extends object> = {
  code: StatusCode;
  /**
   * A developer-facing description of the status.
   *
   * Where possible, this should provide guiding advice for debugging and/or handling the error.
   */
  message?: string;
  contents: D[];
};
