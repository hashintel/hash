Errors use RFC 9457 Problem Details with the `application/problem+json` media type. An operation that can answer an error in another media type documents it on that response.

Replacing `about:blank` with a specific problem type URI is a non-breaking change. Handle a problem type you do not recognize by its HTTP status code.
