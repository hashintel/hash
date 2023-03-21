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

export const convertHttpCodeToStatusCode = (statusCode: number) => {
  if (statusCode >= 100 && statusCode < 200) {
    return StatusCode.Unknown;
  } else if (statusCode === 207 || statusCode === 208) {
    // 207 is a "multi-status" code which requires introspection of the response body to determine
    // the status code, ideally we should never pass this to this function but throwing an error is
    // dangerous here as if this is used in an error mapping function we could drop all
    // the actual error information.
    // 208 is an "already reported" code which has the same considerations of 207, see above.
    return StatusCode.Unknown;
  } else if (statusCode >= 200 && statusCode < 300) {
    // We treat all other 2XX codes as OK, the additional meaning is purposefully dropped for simplicity
    return StatusCode.Ok;
  } else if (statusCode >= 300 && statusCode < 400) {
    // The status model doesn't encapsulate the nuances of 3XX codes. These should be handled by the
    // HTTP handler and ideally won't usually end up being passed to this function.
    return StatusCode.Unknown;
  } else if (statusCode === 400) {
    // Lossy transformation, could also be `FailedPrecondition`, although this seems more likely in
    // more circumstances.
    return StatusCode.InvalidArgument;
  } else if (statusCode === 401) {
    return StatusCode.Unauthenticated;
  } else if (statusCode === 402) {
    // This is a very uncommon status code to do with payment processing
    return StatusCode.FailedPrecondition;
  } else if (statusCode === 403) {
    return StatusCode.PermissionDenied;
  } else if (statusCode === 404) {
    return StatusCode.NotFound;
  } else if (statusCode === 405 || statusCode === 406) {
    // 405 generally refers to an incorrect method being used (e.g. `GET` instead of `POST`)
    // 406 generally refers to an incorrect `Accept` header being used
    return StatusCode.InvalidArgument;
  } else if (statusCode === 407) {
    // We'll consider proxy authentication
    return StatusCode.FailedPrecondition;
  } else if (statusCode === 408) {
    // 408 generally refers to the _server_ waiting too long for the client to send the request
    // perhaps this would be better represented as `Unknown`, `Cancelled`, or `Aborted`?
    return StatusCode.DeadlineExceeded;
  } else if (statusCode === 409) {
    // 409 generally refers to a conflict with the current state of the server, this could refer to
    // transaction lock conflicts, but could also refer to a resource already existing.
    // Unfortunately that means using `AlreadyExists` wouldn't be correct generally here.
    return StatusCode.Aborted;
  } else if (statusCode === 410) {
    return StatusCode.NotFound;
  } else if (statusCode === 411) {
    return StatusCode.InvalidArgument;
  } else if (statusCode === 412) {
    return StatusCode.FailedPrecondition;
  } else if (statusCode === 413 || statusCode === 414 || statusCode === 415) {
    return StatusCode.InvalidArgument;
  } else if (statusCode === 416) {
    return StatusCode.OutOfRange;
  } else if (statusCode === 417) {
    // 417 generally refers to an incorrect `Expect` header being used, or the server not supporting
    // it. Perhaps this would be better represented as `InvalidArgument`?
    return StatusCode.Unimplemented;
  } else if (statusCode === 418) {
    // Unfortunately we don't support a teapot status code
    return StatusCode.Unknown;
  } else if (statusCode > 418 && statusCode <= 422) {
    return StatusCode.InvalidArgument;
  } else if (statusCode === 423) {
    return StatusCode.Aborted;
  } else if (statusCode === 424 || statusCode === 425 || statusCode === 426) {
    // 424 generally refers to a failed dependency, and therefore the client shouldn't retry until
    // the dependency is satisfied
    // 425 generally refers to the request being too early, and needing some other condition to
    // happen first
    // 426 generally refers to the client needing to upgrade to a different protocol
    return StatusCode.FailedPrecondition;
  } else if (statusCode === 427) {
    // 427 is an unassigned code
    return StatusCode.Unknown;
  } else if (statusCode === 428) {
    return StatusCode.FailedPrecondition;
  } else if (statusCode === 429) {
    return StatusCode.ResourceExhausted;
  } else if (statusCode === 430) {
    // 430 is an unassigned code
    return StatusCode.Unknown;
  } else if (statusCode === 431) {
    return StatusCode.InvalidArgument;
  } else if (statusCode > 431 && statusCode < 451) {
    return StatusCode.Unknown;
  } else if (statusCode === 451) {
    // 451 refers to denying access for legal reasons, we could also potentially return
    // `Unavailable` here
    return StatusCode.PermissionDenied;
  } else if (statusCode > 451 && statusCode < 500) {
    return StatusCode.Unknown;
  } else if (statusCode === 500) {
    return StatusCode.Internal;
  } else if (statusCode === 501) {
    return StatusCode.Unimplemented;
  } else if (statusCode === 502) {
    return StatusCode.Internal;
  } else if (statusCode === 503) {
    return StatusCode.Unavailable;
  } else if (statusCode === 504) {
    return StatusCode.DeadlineExceeded;
  } else if (statusCode === 505) {
    // 505 generally refers to an unsupported HTTP version, which potentially could be represented as
    // `InvalidArgument` instead
    return StatusCode.Unimplemented;
  } else if (statusCode === 506) {
    // An uncommon code which isn't fully standardized
    return StatusCode.Internal;
  } else if (statusCode === 507) {
    return StatusCode.ResourceExhausted;
  } else if (statusCode === 508) {
    // 508 generally refers to a loop in the server, which is a server-side problem
    return StatusCode.Internal;
  } else if (statusCode === 509) {
    // This is an unofficial code which is sometimes used to indicate that the server has hit its
    // bandwidth limit
    return StatusCode.Unknown;
  } else if (statusCode === 510) {
    // An uncommon code which refers to a server not supporting a particular extension
    return StatusCode.Unimplemented;
  } else if (statusCode === 511) {
    // An uncommon code which refers to a client needing to authenticate to gain network access
    return StatusCode.Unauthenticated;
  } else {
    return StatusCode.Unknown;
  }
};
