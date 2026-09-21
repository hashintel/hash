# hash-middleware

HTTP middleware for HASH's services: rate limiting, tracing, and the authentication contract whose providers the services supply.

Authentication and rate-limit rejections return `application/problem+json`.
The built-in problems use `about:blank`, the HTTP status phrase as `title`, and a client-safe explanation as `detail` when available.
`AuthenticationError` provides its public problem through `Error::provide`; providers can add custom problems with `attach_problem`.
The response uses the first problem in report frame order. Reports without a problem produce a generic internal server error.
Rate-limit responses carry the delay before retrying in the `Retry-After` header.

HASH treats replacing `about:blank` with a specific problem type URI as a non-breaking API change.
Clients should handle unrecognized problem types using the HTTP status code.
