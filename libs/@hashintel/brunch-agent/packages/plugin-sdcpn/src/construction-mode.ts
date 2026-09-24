/** Minimal exact-Stock control running through Flue, without Brunch composition. */
export const STOCK_OVER_FLUE_MODE = "canonical-petrinaut-tools";

/** Product baseline: Brunch composition with Petrinaut's canonical catalogue. */
export const INTEGRATED_BRUNCH_MODE = "integrated-brunch-canonical";

export const INTEGRATED_PETRINAUT_MODES = [INTEGRATED_BRUNCH_MODE] as const;

export type IntegratedPetrinautMode =
  (typeof INTEGRATED_PETRINAUT_MODES)[number];
export type CanonicalPetrinautMode =
  | typeof STOCK_OVER_FLUE_MODE
  | IntegratedPetrinautMode;

export const isIntegratedPetrinautMode = (
  mode: string | undefined,
): mode is IntegratedPetrinautMode =>
  INTEGRATED_PETRINAUT_MODES.some((integratedMode) => integratedMode === mode);
