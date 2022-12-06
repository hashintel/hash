import { useState } from "react";

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