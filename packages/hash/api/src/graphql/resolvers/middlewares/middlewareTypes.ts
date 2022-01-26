import { Resolver } from "../../apiTypes.gen";

export type ResolverMiddleware<
  TStartContext,
  TArgs,
  TEndContext = TStartContext,
> = (
  next: Resolver<any, any, TEndContext, any>,
) => Resolver<any, any, TStartContext, TArgs>;
