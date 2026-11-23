import {
  PetrinautPresentationContext,
  presentationCapabilities,
  type PetrinautPresentationProfile,
} from "./presentation-context";

import type { PropsWithChildren } from "react";

export const PetrinautPresentationProvider = ({
  profile,
  children,
}: PropsWithChildren<{ profile: PetrinautPresentationProfile }>) => (
  <PetrinautPresentationContext value={presentationCapabilities[profile]}>
    {children}
  </PetrinautPresentationContext>
);
