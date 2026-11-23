import { createContext, use } from "react";

/**
 * A context that has no value outside its provider, and the hook that reads
 * it. The hook throws when no `owner` component above provides the value.
 */
export const requiredContext = <Value>(owner: string) => {
  const Context = createContext<Value | null>(null);
  const useValue = (): Value => {
    const value = use(Context);
    if (value === null) {
      throw new Error(`Must be rendered within ${owner}`);
    }
    return value;
  };
  return [Context, useValue] as const;
};
