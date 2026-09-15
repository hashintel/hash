/** An error identified by a discriminant and a structured reason. */
export class TaggedError<Tag extends string, Reason> extends Error {
  /** Retains the reason independently of its human-readable message. */
  constructor(
    readonly _tag: Tag,
    readonly reason: Reason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Narrows a known error union by its discriminant. */
export const is =
  <const Tag extends string>(tag: Tag) =>
  <E>(error: E): error is Extract<E, TaggedError<Tag, unknown>> =>
    ((typeof error === "object" && error !== null) ||
      typeof error === "function") &&
    "_tag" in error &&
    error._tag === tag;

export const isNot =
  <const Tag extends string>(tag: Tag) =>
  <E>(error: E): error is Exclude<E, TaggedError<Tag, unknown>> =>
    !is(tag)(error);
