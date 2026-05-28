// Public surface for `@hashintel/petrinaut/ui` — the opinionated visual editor.
//
// `<Petrinaut>` is the single editor entry: it takes a
// `PetrinautDocHandle` and renders the full editor on top of
// `<PetrinautProvider>` (`/react`).

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
