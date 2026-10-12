import { createContext, useContext } from "react";

export type FullScreenContextType = {
  isFullScreen: boolean;
  toggleFullScreen: () => void;
};

export const FullScreenContext = createContext<FullScreenContextType | null>(
  null,
);

export const useFullScreen = () => {
  const context = useContext(FullScreenContext);

  if (!context) {
    throw new Error("no FullScreenContext value has been provided");
  }

  return context;
};
