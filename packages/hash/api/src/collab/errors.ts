export class InvalidRequestPayloadError extends Error {}

export class InvalidVersionError extends InvalidRequestPayloadError {
  constructor(version: unknown) {
    super(`Invalid version ${version}`);
  }
}
