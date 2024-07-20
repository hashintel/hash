/**
 * @deprecated
 * @todo Remove this.
 */
export class StatusError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
