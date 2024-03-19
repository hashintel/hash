/* Adapted from the Google Cloud Error Model
    - https://github.com/googleapis/googleapis/blob/master/google/rpc/status.proto
 */

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- this is an enum, 'import type' breaks scripts/codegen
import { StatusCode } from "./status-code";

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
