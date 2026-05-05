// Public surface for `@hashintel/petrinaut/ui` — the opinionated visual editor.
//
// `<PetrinautNext>` is the single editor entry: it takes a
// `PetrinautDocHandle` and renders the full editor on top of
// `<PetrinautProvider>` (`/react`).

export { PetrinautNext } from "./petrinaut-next";
export type { PetrinautNextProps } from "./petrinaut-next";

// SDCPN value-equality check exposed for consumers that need to detect
// no-op changes outside the handle (e.g. memoising Storybook stories).
export { isSDCPNEqual } from "../lib/deep-equal";
