import { createContext, use, type PropsWithChildren } from "react";

export type PetrinautPresentationProfile = "editor" | "review" | "preview";

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
  /**
   * Whether the panels around the canvas float over it. The editor's panels
   * do, so floating controls have to keep clear of them; the Preview docks its
   * inspector as a flex sibling, which shrinks the canvas instead, and
   * reserving the same width there pushes the controls inward twice.
   */
  panelsOverlayCanvas: boolean;
  /** Blur the chrome that floats over the canvas. */
  blurredChrome: boolean;
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
    panelsOverlayCanvas: true,
    blurredChrome: true,
  },
  review: {
    profile: "review",
    showMutationActions: false,
    showSourceCode: true,
    showCustomVisualizers: true,
    showViewportSettings: true,
    showMinimap: true,
    compactControls: false,
    panelsOverlayCanvas: true,
    blurredChrome: true,
  },
  preview: {
    profile: "preview",
    showMutationActions: false,
    showSourceCode: false,
    showCustomVisualizers: false,
    showViewportSettings: false,
    showMinimap: true,
    compactControls: true,
    panelsOverlayCanvas: false,
    blurredChrome: false,
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
