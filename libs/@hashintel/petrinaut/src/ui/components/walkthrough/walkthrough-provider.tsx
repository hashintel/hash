import { type PropsWithChildren } from "react";

import {
  WalkthroughContext,
  type WalkthroughStep,
} from "./walkthrough-context";

type WalkthroughProviderProps = PropsWithChildren<{
  steps: WalkthroughStep[];
}>;

export const WalkthroughProvider: React.FC<WalkthroughProviderProps> = ({
  children,
  steps,
}) => {
  return <WalkthroughContext value={{ steps }}>{children}</WalkthroughContext>;
};
