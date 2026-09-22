Errors use RFC 9457 Problem Details with the `application/problem+json` media type.

Replacing `about:blank` with a specific problem type URI is a non-breaking change. Clients should handle unrecognized problem types using the HTTP status code.
