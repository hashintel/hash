export class RichError<const Context extends string, Reason> {
  public readonly cause: AnyReason[] = [];

  constructor(
    public readonly context: Context,
    public readonly reason: Reason,
  ) {}

  public changeContext<const C extends string, R>(
    context: C,
    reason: R,
  ): RichError<C, R> {
    const error = new RichError(context, reason);
    error.cause.push(this);
    return error;
  }
}

type AnyReason = RichError<any, any>;
