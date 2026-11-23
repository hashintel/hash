import { useState } from "react";

/** The value as it was on the last render on which `held` was false. */
export const useHeldWhile = <Value>(held: boolean, value: Value): Value => {
  const [kept, setKept] = useState(value);
  if (!held && kept !== value) {
    setKept(value);
  }

  return held ? kept : value;
};
