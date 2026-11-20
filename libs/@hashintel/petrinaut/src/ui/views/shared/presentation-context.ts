import { createContext, use } from "react";

export type PetrinautPresentationProfile = "editor" | "review" | "preview";

export type PetrinautPresentationCapabilities = {
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

const editorCapabilities: PetrinautPresentationCapabilities = {
  showMutationActions: true,
  showSourceCode: true,
  showCustomVisualizers: true,
  showViewportSettings: true,
  showMinimap: true,
  compactControls: false,
  panelsOverlayCanvas: true,
  blurredChrome: true,
};

export const presentationCapabilities: Record<
  PetrinautPresentationProfile,
  PetrinautPresentationCapabilities
> = {
  editor: editorCapabilities,
  review: { ...editorCapabilities, showMutationActions: false },
  preview: {
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

export const PetrinautPresentationContext =
  createContext<PetrinautPresentationCapabilities>(editorCapabilities);

export const usePetrinautPresentation = () => use(PetrinautPresentationContext);
