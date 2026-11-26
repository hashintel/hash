import { createContext } from "react";

import type { SelectionItem } from "@hashintel/petrinaut-core";

export const SelectedItemsContext = createContext<SelectionItem[]>([]);
