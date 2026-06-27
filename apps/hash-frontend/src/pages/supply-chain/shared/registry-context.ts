import { createContext, useContext } from "react";

import type { SiteRef } from "./data";
import type { Product } from "./types";

/**
 * The product + site registry, loaded once by `SupplyChainDataShell` and shared with every
 * page via context. Mirrors the SPA's single `AppLayout` bootstrap (products and
 * sites were fetched once at app start) now that each route is its own page.
 */
export interface Registry {
  products: Product[];
  sites: SiteRef[];
  demoActive: boolean;
}

export const RegistryContext = createContext<Registry>({
  products: [],
  sites: [],
  demoActive: false,
});

export function useRegistry(): Registry {
  return useContext(RegistryContext);
}
