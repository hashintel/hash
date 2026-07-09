import { createContext } from "react";

import type { Petrinaut } from "@hashintel/petrinaut-core";

export const PetrinautInstanceContext = createContext<Petrinaut | null>(null);
