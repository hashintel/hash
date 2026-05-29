import { useEffect, useState, type PropsWithChildren } from "react";

import { WalkthroughContext } from "./walkthrough-context";

import type { WalkthroughStep } from "./walkthrough-steps";

const STORAGE_KEY = "petrinaut:hasSeenWalkthrough";

const loadHasSeenWalkthrough = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

type WalkthroughProviderProps = PropsWithChildren<{
  steps: WalkthroughStep[];
}>;

export const WalkthroughProvider: React.FC<WalkthroughProviderProps> = ({
  children,
  steps,
}) => {
  const [hasSeenWalkthrough, setHasSeenWalkthrough] = useState(
    loadHasSeenWalkthrough,
  );
  const [isOpen, setIsOpen] = useState(() => !hasSeenWalkthrough);

  useEffect(() => {
    if (!hasSeenWalkthrough) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Ignore write failures (e.g. quota exceeded)
    }
  }, [hasSeenWalkthrough]);

  const open = () => setIsOpen(true);
  const close = () => {
    setIsOpen(false);
    if (!hasSeenWalkthrough) {
      setHasSeenWalkthrough(true);
    }
  };

  return (
    <WalkthroughContext value={{ isOpen, open, close, steps }}>
      {children}
    </WalkthroughContext>
  );
};
