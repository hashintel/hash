/* eslint-disable react/jsx-no-constructed-context-values */
import { createContext, type ReactNode, use } from "react";

import type { Color, Place } from "../../../../core/types/sdcpn";

/**
 * Context for providing place-specific data to subview components
 * used within the PlaceProperties panel.
 */
interface PlacePropertiesContextValue {
  /** The currently selected place */
  place: Place;
  /** The type assigned to the place (if any) */
  placeType: Color | null;
  /** All available types in the Petri net */
  types: Color[];
  /** Whether the panel is in read-only mode */
  isReadOnly: boolean;
  /** Function to update the place */
  updatePlace: (placeId: string, updateFn: (place: Place) => void) => void;
}

const PlacePropertiesContext =
  createContext<PlacePropertiesContextValue | null>(null);

/**
 * Hook to access the place properties context.
 * Must be used within a PlacePropertiesProvider.
 */
export const usePlacePropertiesContext = (): PlacePropertiesContextValue => {
  const context = use(PlacePropertiesContext);
  if (!context) {
    throw new Error(
      "usePlacePropertiesContext must be used within a PlacePropertiesProvider",
    );
  }
  return context;
};

interface PlacePropertiesProviderProps {
  place: Place;
  placeType: Color | null;
  types: Color[];
  isReadOnly: boolean;
  updatePlace: (placeId: string, updateFn: (place: Place) => void) => void;
  children: ReactNode;
}

/**
 * Provider component that makes place data available to subview components.
 */
export const PlacePropertiesProvider: React.FC<
  PlacePropertiesProviderProps
> = ({ place, placeType, types, isReadOnly, updatePlace, children }) => {
  return (
    <PlacePropertiesContext.Provider
      value={{ place, placeType, types, isReadOnly, updatePlace }}
    >
      {children}
    </PlacePropertiesContext.Provider>
  );
};
