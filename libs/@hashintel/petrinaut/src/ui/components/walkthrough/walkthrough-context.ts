import { createContext } from "react";

export type WalkthroughStep = {
  id: string;
  title: string;
  body: React.ReactNode;
  videoHref: string;
  videoAlt: string;
};

export type WalkthroughContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  steps: WalkthroughStep[];
};

export const WalkthroughContext = createContext<WalkthroughContextValue | null>(
  null,
);
