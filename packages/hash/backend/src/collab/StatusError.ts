/**
 * @todo consider removing this class
 * @deprecated
 */
export class StatusError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
