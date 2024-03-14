import { createContext } from "react";

import type { SiteMap } from "./sitemap";

export const SiteMapContext = createContext<SiteMap>({
  pages: [],
});
