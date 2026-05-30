import { createContext } from "react";

export type WalkthroughStep = {
  id: string;
  title: React.ReactNode;
  body: React.ReactNode;
  videoHref: string;
  videoAlt: string;
};

export type WalkthroughContextValue = {
  steps: WalkthroughStep[];
};

export const WalkthroughContext = createContext<WalkthroughContextValue | null>(
  null,
);
