// Public surface for `@hashintel/petrinaut/ui` — the opinionated visual editor.
//
// `<Petrinaut>` is the single editor entry: it takes a
// `PetrinautDocHandle` and renders the full editor on top of
// `<PetrinautProvider>` (`/react`).

export { Petrinaut } from "./petrinaut";
export type { PetrinautProps } from "./petrinaut";

// SDCPN value-equality check exposed for consumers that need to detect
// no-op changes outside the handle (e.g. memoising Storybook stories).
export { isSDCPNEqual } from "../lib/deep-equal";
