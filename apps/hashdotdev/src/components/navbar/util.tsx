import { ReactElement } from "react";

import { SiteMapPage, SiteMapPageSection } from "../../pages/shared/sitemap";
import { FaIcon } from "../icons/fa-icon";

export const itemIsPage = (
  item: SiteMapPage | SiteMapPageSection,
): item is SiteMapPage => "href" in item;

export const pageTitleToIcons: Record<string, ReactElement> = {
  Roadmap: <FaIcon name="diagram-sankey" type="solid" />,
  Docs: <FaIcon name="book-atlas" type="regular" />,
  Tutorials: <FaIcon name="map" type="solid" />,
  Blog: <FaIcon name="newspaper" type="solid" />,
};
