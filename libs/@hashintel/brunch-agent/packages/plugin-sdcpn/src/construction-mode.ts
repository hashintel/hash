/** Minimal exact-Stock control running through Flue, without Brunch composition. */
export const STOCK_OVER_FLUE_MODE = "canonical-petrinaut-tools";

/** Product baseline: Brunch composition with Petrinaut's canonical catalogue. */
export const INTEGRATED_BRUNCH_MODE = "integrated-brunch-canonical";

/** Evaluation identity reserved for the bounded declared-projection tracer. */
export const BRUNCH_DECLARED_PROJECTION_MODE = "brunch-declared-projection";

/** Evaluation identity reserved for the bounded deep-construction tracer. */
export const BRUNCH_DEEP_CONSTRUCTION_MODE = "brunch-deep-construction";

export const INTEGRATED_PETRINAUT_MODES = [
  INTEGRATED_BRUNCH_MODE,
  BRUNCH_DECLARED_PROJECTION_MODE,
  BRUNCH_DEEP_CONSTRUCTION_MODE,
] as const;

export type IntegratedPetrinautMode =
  (typeof INTEGRATED_PETRINAUT_MODES)[number];
export type CanonicalPetrinautMode =
  | typeof STOCK_OVER_FLUE_MODE
  | IntegratedPetrinautMode;

export const isIntegratedPetrinautMode = (
  mode: string | undefined,
): mode is IntegratedPetrinautMode =>
  INTEGRATED_PETRINAUT_MODES.some((integratedMode) => integratedMode === mode);

/** @deprecated Use STOCK_OVER_FLUE_MODE. */
export const CANONICAL_PETRINAUT_TOOLS_MODE = STOCK_OVER_FLUE_MODE;
