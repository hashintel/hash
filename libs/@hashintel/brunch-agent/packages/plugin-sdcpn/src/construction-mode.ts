import { brunchModes } from "@hashintel/brunch-agent/constants";

export const INTEGRATED_PETRINAUT_MODES = [brunchModes.integrated] as const;

export type IntegratedPetrinautMode =
  (typeof INTEGRATED_PETRINAUT_MODES)[number];
export type CanonicalPetrinautMode =
  | typeof brunchModes.stockOverFlue
  | IntegratedPetrinautMode;

export const isIntegratedPetrinautMode = (
  mode: string | undefined,
): mode is IntegratedPetrinautMode =>
  INTEGRATED_PETRINAUT_MODES.some((integratedMode) => integratedMode === mode);
