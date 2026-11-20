import { createContext } from "react";

import type { PetrinautSlots } from "./types/petrinaut-slots";

export const noSlots: PetrinautSlots = {};

/**
 * The host's slots. `<Petrinaut>` provides them from above the editor's
 * providers, and each slot is read by the component that shows it.
 *
 * A host may pass a new `slots` object on every render: read here, it renders
 * the components that show a slot and no provider above the view.
 */
export const PetrinautSlotsContext = createContext<PetrinautSlots>(noSlots);
