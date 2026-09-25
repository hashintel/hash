import { brunchModes } from "@hashintel/brunch-agent/constants";

export const INTEGRATED_PETRINAUT_MODES = [brunchModes.integrated] as const;

type IntegratedPetrinautMode = (typeof INTEGRATED_PETRINAUT_MODES)[number];
export type CanonicalPetrinautMode =
  | typeof brunchModes.stockOverFlue
  | IntegratedPetrinautMode;
