// @todo updatee from blockprotocol
import { getAllPages } from "./mdxUtil";

export type SiteMapPageSection = {
  title: string;
  anchor: string;
  subSections: SiteMapPageSection[];
};

export type SiteMapPage = {
  title: string;
  href: string;
  subPages: SiteMapPage[];
  sections: SiteMapPageSection[];
};

export type SiteMap = {
  pages: SiteMapPage[];
};

export const getBlogSubPages = (): SiteMapPage[] =>
  getAllPages({ pathToDirectory: "blog" });

// @todo use this
export const generateSiteMap = (): SiteMap => ({
  pages: [
    {
      title: "Blog",
      href: "/blog",
      sections: [],
      subPages: getBlogSubPages(),
    },
  ],
});
