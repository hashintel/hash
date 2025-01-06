/**
 * Defines a logical status and error model that is suitable for different programming environments, including REST APIs
 * and RPC APIs.
 */

import type { Status } from "../type-defs/status.js";
import { StatusCode } from "./status-code.js";

export type { Status } from "../type-defs/status.js";
export {
  convertHttpCodeToStatusCode,
  convertStatusCodeToHttpCode,
  StatusCode,
} from "./status-code.js";

export const isStatus = (
  value: unknown,
): value is Status<Record<string, unknown>> => {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    Object.values(StatusCode).includes(value.code as StatusCode) &&
    (!("message" in value) || typeof value.message === "string") &&
    "contents" in value &&
    Array.isArray(value.contents) &&
    value.contents.every((content) => typeof content === "object")
  );
};
