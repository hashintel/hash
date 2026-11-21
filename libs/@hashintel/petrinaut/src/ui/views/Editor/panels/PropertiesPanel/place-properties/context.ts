import { createContext, use } from "react";

import type { Color, Place } from "@hashintel/petrinaut-core";

interface PlacePropertiesContextValue {
  place: Place;
  placeType: Color | null;
  /** The net's types; empty while the colours extension is off. */
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
