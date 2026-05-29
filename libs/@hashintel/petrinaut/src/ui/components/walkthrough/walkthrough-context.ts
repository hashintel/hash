import { createContext } from "react";

export type WalkthroughContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

const noop = () => {};

export const WalkthroughContext = createContext<WalkthroughContextValue>({
  isOpen: false,
  open: noop,
  close: noop,
});
