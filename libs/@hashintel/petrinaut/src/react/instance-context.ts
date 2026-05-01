import { createContext } from "react";

import type { Petrinaut } from "../core/instance";

export const PetrinautInstanceContext = createContext<Petrinaut | null>(null);
