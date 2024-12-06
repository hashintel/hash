import { Data, Match, Option, pipe } from "effect";

export class InvalidUtf8Error extends Data.TaggedError("InvalidUtf8Error")<{
  readonly cause: unknown;
}> {
  get message() {
    return "Invalid UTF-8 encoding";
  }
}

export class ExpectedItemCountMismatchError extends Data.TaggedError(
  "ExpectedItemCountMismatchError",
)<{
  min: Option.Option<number>;
  max: Option.Option<number>;
  received: number;
}> {
  static exactly(expected: number, actual: number) {
    return new ExpectedItemCountMismatchError({
      min: Option.some(expected),
      max: Option.some(expected),
      received: actual,
    });
  }

  static atLeast(expected: number, actual: number) {
    return new ExpectedItemCountMismatchError({
      min: Option.some(expected),
      max: Option.none(),
      received: actual,
    });
  }

  static atMost(expected: number, actual: number) {
    return new ExpectedItemCountMismatchError({
      min: Option.none(),
      max: Option.some(expected),
      received: actual,
    });
  }

  static between(min: number, max: number, actual: number) {
    return new ExpectedItemCountMismatchError({
      min: Option.some(min),
      max: Option.some(max),
      received: actual,
    });
  }

  get message() {
    return pipe(
      Match.value({ min: this.min, max: this.max }),
      Match.when(
        { min: Option.isSome<number>, max: Option.isSome<number> },
        ({ min, max }) =>
          min.value === max.value
            ? `Expected exactly ${min.value} items, got ${this.received}`
            : `Expected between ${min.value} and ${max.value} items, got ${this.received}`,
      ),
      Match.when(
        { min: Option.isSome<number>, max: Option.isNone<number> },
        ({ min }) =>
          `Expected at least ${min.value} items, got ${this.received}`,
      ),
      Match.when(
        { min: Option.isNone<number>, max: Option.isSome<number> },
        ({ max }) =>
          `Expected at most ${max.value} items, got ${this.received}`,
      ),
      Match.when(
        { min: Option.isNone<number>, max: Option.isNone<number> },
        () => `Mismatched amount of items, got ${this.received}`,
      ),
      Match.orElseAbsurd,
    );
  }
}
