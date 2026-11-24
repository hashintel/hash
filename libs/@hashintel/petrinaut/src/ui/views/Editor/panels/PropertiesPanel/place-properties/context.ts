import { requiredContext } from "../../../../../shared/required-context";

import type { Color, Place } from "@hashintel/petrinaut-core";

export const [PlacePropertiesContext, usePlacePropertiesContext] =
  requiredContext<{
    place: Place;
    placeType: Color | null;
    /** The net's types; empty while the colours extension is off. */
    types: Color[];
  }>("PlaceProperties");
