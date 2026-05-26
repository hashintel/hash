import { generateDefaultLambdaCode } from "./default-codes";

import type { SDCPN } from "./types/sdcpn";

export const PETRINAUT_EXTENSION_NAMES = [
  "colors",
  "stochasticity",
  "dynamics",
] as const;

export type PetrinautExtension = (typeof PETRINAUT_EXTENSION_NAMES)[number];

export type PetrinautExtensionSettings = Readonly<
  Record<PetrinautExtension, boolean>
>;

export type PetrinautHandleCapabilities = {
  /**
   * Whether the document handle should be treated as read-only by Petrinaut.
   * Host-level readonly config can still make a writable handle read-only.
   */
  readonly?: boolean;
  /**
   * Petri-net extensions unavailable for this handle. Omitted means all
   * extensions are enabled.
   */
  disabledExtensions?: readonly PetrinautExtension[];
};

export type ResolvedPetrinautHandleCapabilities = {
  readonly: boolean;
  disabledExtensions: readonly PetrinautExtension[];
  extensions: PetrinautExtensionSettings;
};

export const DEFAULT_PETRINAUT_EXTENSIONS: PetrinautExtensionSettings = {
  colors: true,
  stochasticity: true,
  dynamics: true,
};

export const resolvePetrinautHandleCapabilities = (
  capabilities?: PetrinautHandleCapabilities,
): ResolvedPetrinautHandleCapabilities => {
  const disabledExtensions = [...new Set(capabilities?.disabledExtensions ?? [])];
  const disabled = new Set<PetrinautExtension>(disabledExtensions);

  return {
    readonly: capabilities?.readonly ?? false,
    disabledExtensions,
    extensions: {
      colors: !disabled.has("colors"),
      stochasticity: !disabled.has("stochasticity"),
      dynamics: !disabled.has("dynamics"),
    },
  };
};

const canUseDynamics = (extensions: PetrinautExtensionSettings): boolean =>
  extensions.colors && extensions.dynamics;

export const isSelectionTypeAvailableForExtensions = (
  type: string,
  extensions: PetrinautExtensionSettings,
): boolean => {
  if (type === "type") {
    return extensions.colors;
  }
  if (type === "differentialEquation") {
    return canUseDynamics(extensions);
  }
  return true;
};

export const sanitizePlaceForExtensions = <Place extends SDCPN["places"][number]>(
  place: Place,
  extensions: PetrinautExtensionSettings,
): Place => {
  if (extensions.colors && extensions.dynamics) {
    return place;
  }

  return {
    ...place,
    colorId: extensions.colors ? place.colorId : null,
    dynamicsEnabled: canUseDynamics(extensions)
      ? place.dynamicsEnabled
      : false,
    differentialEquationId: canUseDynamics(extensions)
      ? place.differentialEquationId
      : null,
    visualizerCode: extensions.colors ? place.visualizerCode : undefined,
  };
};

export const sanitizeTransitionForExtensions = <
  Transition extends SDCPN["transitions"][number],
>(
  transition: Transition,
  extensions: PetrinautExtensionSettings,
): Transition => {
  if (extensions.stochasticity && extensions.colors) {
    return transition;
  }

  return {
    ...transition,
    lambdaType:
      extensions.stochasticity || transition.lambdaType !== "stochastic"
        ? transition.lambdaType
        : "predicate",
    lambdaCode:
      extensions.stochasticity || transition.lambdaType !== "stochastic"
        ? transition.lambdaCode
        : generateDefaultLambdaCode("predicate"),
    transitionKernelCode: extensions.colors
      ? transition.transitionKernelCode
      : "",
  };
};

export const stripDisabledExtensionData = (
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): void => {
  if (!extensions.colors) {
    sdcpn.types.splice(0);
  }

  if (!canUseDynamics(extensions)) {
    sdcpn.differentialEquations.splice(0);
  }

  for (const place of sdcpn.places) {
    Object.assign(place, sanitizePlaceForExtensions(place, extensions));
    if (!extensions.colors) {
      delete place.visualizerCode;
    }
  }

  for (const transition of sdcpn.transitions) {
    Object.assign(
      transition,
      sanitizeTransitionForExtensions(transition, extensions),
    );
  }
};
