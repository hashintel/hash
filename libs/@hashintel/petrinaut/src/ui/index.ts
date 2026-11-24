/**
 * Public surface for `@hashintel/petrinaut/ui` — the opinionated visual editor.
 *
 * `<Petrinaut>` is the single editor entry: it takes a
 * `PetrinautDocHandle` and renders the full editor on top of
 * `<PetrinautProvider>` (`/react`).
 *
 * @layerRoot ui
 * @role The visual editor: canvas, panels, dialogs and the Monaco integration
 */

export { KeyboardShortcut } from "./shared/keyboard-shortcut";

// The three icons the Brunch assistant imports from here. Every other icon is
// imported from `@hashintel/ds-icons`.
export {
  HashIcon as ExperimentalIcon,
  MicrophoneIcon,
  VoiceIcon,
} from "@hashintel/ds-icons";
export { Petrinaut } from "./petrinaut";

// The user guide's pages, so an assistant's tools can answer with them.
export { petrinautDocsContent } from "./petrinaut-docs-content";
export type { PetrinautProps } from "./petrinaut";
export type {
  PetrinautNavigationAction,
  PetrinautNavigationController,
  PetrinautNavigationHistory,
  PetrinautNavigationHistoryPolicy,
  PetrinautNavigationIntent,
  PetrinautNavigationOverlay,
  PetrinautNavigationState,
  PetrinautNavigationUpdate,
  PetrinautNavigationUpdater,
  PetrinautSimulateResource,
} from "../react/navigation/navigation";

// SDCPN value-equality check exposed for consumers that need to detect
// no-op changes outside the handle (e.g. memoising Storybook stories).
export { isSDCPNEqual } from "@hashintel/petrinaut-core";

// Slots — named locations into which the host can inject arbitrary React components.
export type { PetrinautSlots } from "./petrinaut-slots";
