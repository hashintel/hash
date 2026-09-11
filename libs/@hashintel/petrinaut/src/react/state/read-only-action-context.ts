import { createContext } from "react";

export type ReadOnlyAction = { label: string; onClick: () => void };

export const ReadOnlyActionContext = createContext<ReadOnlyAction | undefined>(
  undefined,
);
