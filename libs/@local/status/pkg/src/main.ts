/**
 * Defines a logical status and error model that is suitable for different programming environments, including REST APIs
 * and RPC APIs.
 */

import { Status } from "../../type-defs/status";
import { StatusCode } from "./status-code";

export { Status } from "../../type-defs/status";
export { convertStatusCodeToHttpCode, StatusCode } from "./status-code";

export const isStatus = (value: unknown): value is Status<object> => {
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
