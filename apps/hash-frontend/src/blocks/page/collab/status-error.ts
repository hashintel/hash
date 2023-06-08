/**
 * @deprecated
 * @todo remove this
 */
export class StatusError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
