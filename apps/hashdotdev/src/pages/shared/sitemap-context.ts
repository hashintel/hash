import { createContext } from "react";

import { SiteMap } from "./sitemap";

export const SiteMapContext = createContext<SiteMap>({
  pages: [],
});
