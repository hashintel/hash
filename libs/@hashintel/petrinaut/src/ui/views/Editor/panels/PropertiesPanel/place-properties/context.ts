import { createContext, use } from "react";

import type { Color, Place } from "@hashintel/petrinaut-core";

interface PlacePropertiesContextValue {
  /** The currently selected place */
  place: Place;
  /** The type assigned to the place (if any) */
  placeType: Color | null;
  /** All available types in the Petri net */
  types: Color[];
}

export const PlacePropertiesContext =
  createContext<PlacePropertiesContextValue | null>(null);

export const usePlacePropertiesContext = (): PlacePropertiesContextValue => {
  const context = use(PlacePropertiesContext);
  if (!context) {
    throw new Error(
      "usePlacePropertiesContext must be used within PlaceProperties",
    );
  }
  return context;
};
