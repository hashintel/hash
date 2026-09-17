# hash-middleware

HTTP middleware for HASH's services: rate limiting, tracing, and the authentication contract whose providers the services supply.

Authentication and rate-limit rejections return `application/problem+json` with `type` set to `about:blank`.
The `title` is the HTTP status phrase; `detail` provides a client-safe explanation when available.
Rate-limit responses carry the delay before retrying in the `Retry-After` header.

HASH treats replacing `about:blank` with a specific problem type URI as a non-breaking API change.
Clients should handle unrecognized problem types using the HTTP status code.
