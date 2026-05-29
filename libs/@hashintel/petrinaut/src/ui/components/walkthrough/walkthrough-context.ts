import { createContext } from "react";

import type { WalkthroughStep } from "./walkthrough-steps";

export type WalkthroughContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  steps: WalkthroughStep[];
};

export const WalkthroughContext = createContext<WalkthroughContextValue | null>(
  null,
);
