export class TypeMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TypeMismatchError";
  }
}
