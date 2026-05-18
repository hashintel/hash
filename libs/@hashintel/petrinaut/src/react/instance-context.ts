import { createContext } from "react";

import type { Petrinaut } from "@hashintel/petrinaut-core/instance";

export const PetrinautInstanceContext = createContext<Petrinaut | null>(null);
