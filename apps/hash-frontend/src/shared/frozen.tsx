import { useFrozenValue } from "./use-frozen-value";

import type { FunctionComponent, PropsWithChildren } from "react";

export const Frozen: FunctionComponent<
  PropsWithChildren<{
    frozen: boolean;
  }>
> = ({ children, frozen }) => {
  const frozenChildren = useFrozenValue(children, frozen);

  // Needed to render children directly as could be string, etc
  // eslint-disable-next-line react/jsx-no-useless-fragment
  return <>{frozenChildren}</>;
};
