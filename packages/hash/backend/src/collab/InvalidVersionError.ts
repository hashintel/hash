export class InvalidVersionError extends Error {
  constructor(version: any) {
    super(`Invalid version ${version}`);
  }
}
