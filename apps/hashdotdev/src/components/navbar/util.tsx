import { faMap, faNewspaper } from "@fortawesome/free-solid-svg-icons";
import { ReactElement } from "react";

import { SiteMapPage, SiteMapPageSection } from "../../pages/shared/sitemap";
import { BookAtlasRegularIcon } from "../icons/book-atlas-regular-icon";
import { DiagramSankeySolidIcon } from "../icons/diagram-sankey-solid-icon";
import { FontAwesomeIcon } from "../icons/font-awesome-icon";

export const itemIsPage = (
  item: SiteMapPage | SiteMapPageSection,
): item is SiteMapPage => "href" in item;

export const pageTitleToIcons: Record<string, ReactElement> = {
  Roadmap: <DiagramSankeySolidIcon />,
  Docs: <BookAtlasRegularIcon />,
  Tutorials: <FontAwesomeIcon icon={faMap} />,
  Blog: <FontAwesomeIcon icon={faNewspaper} />,
};
