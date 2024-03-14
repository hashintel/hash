import type { ResolverFn } from "../../api-types.gen";

export type ResolverMiddleware<
  TStartContext,
  TArgs,
  TEndContext = TStartContext,
> = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  next: ResolverFn<any, any, TEndContext, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => ResolverFn<any, any, TStartContext, TArgs>;
