// Public surface for `@hashintel/petrinaut/ui` — the opinionated visual editor.
//
// Phase 4 will migrate `<Petrinaut>` (the existing prop-shaped editor),
// `views/`, `components/`, `monaco/`, etc. into this layer. For now it
// exposes only `<PetrinautNext>` — the handle-driven entry from the
// Phase 0 spike.

export { PetrinautNext } from "./petrinaut-next";
export type { PetrinautNextProps } from "./petrinaut-next";

// Today the existing prop-shaped <Petrinaut> still lives at src/petrinaut.tsx.
// Re-exported here so `/ui` consumers get the opinionated editor too. Phase 4
// will move the file proper into /ui.
export { Petrinaut, isSDCPNEqual } from "../petrinaut";
export type { PetrinautProps } from "../petrinaut";
