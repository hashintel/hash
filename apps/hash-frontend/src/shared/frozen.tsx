import { FunctionComponent, PropsWithChildren, useState } from "react";

export const useFrozenValue = <T extends any>(
  value: T,
  isFrozen: boolean,
): T => {
  const [frozen, setFrozen] = useState(value);

  if (!isFrozen && frozen !== value) {
    setFrozen(value);
  }

  return frozen;
};

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
