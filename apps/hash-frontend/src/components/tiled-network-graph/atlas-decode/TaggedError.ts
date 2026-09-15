const isFunction = (input: unknown): input is Function => {
  return typeof input === "function";
};

const isObject = (input: unknown): input is object => {
  return (typeof input === "object" && input !== null) || isFunction(input);
};

export class TaggedError<T> extends Error {
  readonly _tag: T;

  constructor(tag: T, message: string, options?: ErrorOptions) {
    super(message, options);
    this._tag = tag;
  }
}

export const is =
  <T, U>(tag: U) =>
  (error: T): error is Extract<T, TaggedError<U>> => {
    return isObject(error) && "_tag" in error && error._tag === tag;
  };
