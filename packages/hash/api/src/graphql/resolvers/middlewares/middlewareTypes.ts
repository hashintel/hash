import { ResolverFn } from "../../api-types.gen";

export type ResolverMiddleware<
  TStartContext,
  TArgs,
  TEndContext = TStartContext,
> = (
  next: ResolverFn<any, any, TEndContext, any>,
) => ResolverFn<any, any, TStartContext, TArgs>;
