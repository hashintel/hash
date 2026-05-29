import { use, useState, type PropsWithChildren } from "react";

import { UserSettingsContext } from "../../../react/state/user-settings-context";
import { WalkthroughContext } from "./walkthrough-context";

export const WalkthroughProvider: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const { hasSeenWalkthrough, setHasSeenWalkthrough } =
    use(UserSettingsContext);

  const [isOpen, setIsOpen] = useState(() => !hasSeenWalkthrough);

  const open = () => setIsOpen(true);
  const close = () => {
    setIsOpen(false);
    if (!hasSeenWalkthrough) {
      setHasSeenWalkthrough(true);
    }
  };

  return (
    <WalkthroughContext value={{ isOpen, open, close }}>
      {children}
    </WalkthroughContext>
  );
};
