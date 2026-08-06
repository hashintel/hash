/**
 * Public surface for `@hashintel/petrinaut/ui` — the opinionated visual editor.
 *
 * `<Petrinaut>` is the single editor entry: it takes a
 * `PetrinautDocHandle` and renders the full editor on top of
 * `<PetrinautProvider>` (`/react`).
 *
 * @layerRoot ui
 * @layerName Editor UI
 * @role The visual editor: canvas, panels, dialogs and the Monaco integration
 * @entryPoint @hashintel/petrinaut/ui
 * @invariant Consumes the React layer's contexts rather than reaching into the core directly, so state ownership stays in one place
 */

export { Petrinaut } from "./petrinaut";
export type { PetrinautAiMessage } from "./views/Editor/panels/ai-assistant-panel";
export type {
  PetrinautAiAssistant,
  PetrinautAiChatTransport,
  PetrinautProps,
} from "./petrinaut";
export { DefaultChatTransport } from "ai";

// SDCPN value-equality check exposed for consumers that need to detect
// no-op changes outside the handle (e.g. memoising Storybook stories).
export { isSDCPNEqual } from "@hashintel/petrinaut-core";

// Viewport action — shape consumers use to add custom buttons to the
// viewport-controls panel. Lives in /ui because it carries `React.ReactNode`.
export type { ViewportAction } from "./types/viewport-action";

// Slots — named locations into which the host can inject arbitrary React components.
export type { PetrinautSlots } from "./types/petrinaut-slots";

// Walkthrough — first-visit product tour. Exposed so embedders can drive it
// programmatically (e.g. trigger from their own help menu) without relying on
// the built-in TopBar button.
export {
  WalkthroughContext,
  WalkthroughProvider,
  WalkthroughDialog,
} from "./components/walkthrough";
export type {
  WalkthroughContextValue,
  WalkthroughStep,
} from "./components/walkthrough";
