import { createContext } from "react";

import type { PetrinautSlots } from "./types/petrinaut-slots";

export const noSlots: PetrinautSlots = {};

/**
 * The host's slots. `<Petrinaut>` provides them from above the editor's
 * providers, and each slot is read by the component that shows it.
 *
 * A host may pass a new `slots` object on every render. As a prop of the
 * editor view it made a new view element each time, and with it a new child
 * for every provider above the view, which rendered them all.
 */
export const PetrinautSlotsContext = createContext<PetrinautSlots>(noSlots);
