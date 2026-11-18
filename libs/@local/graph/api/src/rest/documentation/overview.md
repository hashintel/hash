Errors use RFC 9457 Problem Details with the `application/problem+json` media type.

Replacing `about:blank` with a specific problem type URI is a non-breaking change. Handle a problem type you do not recognize by its HTTP status code.
