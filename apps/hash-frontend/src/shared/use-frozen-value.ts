import { useState } from "react";

import type { ReactNode } from "react";

export const useFrozenValue = <T extends ReactNode>(
  value: T,
  isFrozen: boolean,
): T => {
  const [frozen, setFrozen] = useState(value);

  if (!isFrozen && frozen !== value) {
    setFrozen(value);
  }

  return frozen;
};
