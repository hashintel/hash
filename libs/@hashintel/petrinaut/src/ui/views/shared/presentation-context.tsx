import { createContext, use, type PropsWithChildren } from "react";

export type PetrinautPresentationProfile = "editor" | "review";

export type PetrinautPresentationCapabilities = {
  profile: PetrinautPresentationProfile;
  /** Show controls whose only purpose is to mutate the authored net. */
  showMutationActions: boolean;
  /** Show authored TypeScript source in property inspectors. */
  showSourceCode: boolean;
  /** Compile and display user-authored visualizer code. */
  showCustomVisualizers: boolean;
  /** Show the full viewport settings surface and editor-only viewport actions. */
  showViewportSettings: boolean;
  /** Show the canvas overview minimap. */
  showMinimap: boolean;
  /** Prefer controls sized for a compact embed over the full editor sizing. */
  compactControls: boolean;
};

const PRESENTATION_CAPABILITIES: Record<
  PetrinautPresentationProfile,
  PetrinautPresentationCapabilities
> = {
  editor: {
    profile: "editor",
    showMutationActions: true,
    showSourceCode: true,
    showCustomVisualizers: true,
    showViewportSettings: true,
    showMinimap: true,
    compactControls: false,
  },
  review: {
    profile: "review",
    showMutationActions: false,
    showSourceCode: true,
    showCustomVisualizers: true,
    showViewportSettings: true,
    showMinimap: true,
    compactControls: false,
  },
};

const PetrinautPresentationContext =
  createContext<PetrinautPresentationCapabilities>(
    PRESENTATION_CAPABILITIES.editor,
  );

export const PetrinautPresentationProvider = ({
  profile,
  children,
}: PropsWithChildren<{ profile: PetrinautPresentationProfile }>) => (
  <PetrinautPresentationContext value={PRESENTATION_CAPABILITIES[profile]}>
    {children}
  </PetrinautPresentationContext>
);

export const usePetrinautPresentation = () => use(PetrinautPresentationContext);
