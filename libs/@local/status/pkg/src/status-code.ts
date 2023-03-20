import { StatusCode } from "../../type-defs/status-code";

export { StatusCode } from "../../type-defs/status-code";

const STATUS_CODE_TO_HTTP_CODE: Record<StatusCode, number> = {
  OK: 200,
  CANCELLED: 499,
  UNKNOWN: 500,
  INVALID_ARGUMENT: 400,
  DEADLINE_EXCEEDED: 504,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  PERMISSION_DENIED: 403,
  UNAUTHENTICATED: 401,
  RESOURCE_EXHAUSTED: 429,
  FAILED_PRECONDITION: 400,
  ABORTED: 409,
  OUT_OF_RANGE: 400,
  UNIMPLEMENTED: 501,
  INTERNAL: 500,
  UNAVAILABLE: 503,
  DATA_LOSS: 500,
} as const;

export const convertStatusCodeToHttpCode = (statusCode: StatusCode): number =>
  STATUS_CODE_TO_HTTP_CODE[statusCode];
