import { recursivelyGetDocsPages } from "./mdx-utils";

export type SiteMapPageSection = {
  title: string;
  anchor: string;
  subSections: SiteMapPageSection[];
};

export type SiteMapPage = {
  title: string;
  titleDerivedFromDirectoryName?: string;
  href: string;
  markdownFilePath?: string;
  subPages: SiteMapPage[];
  sections: SiteMapPageSection[];
};

export type SiteMap = {
  pages: SiteMapPage[];
};

export const generateSiteMap = (): SiteMap => ({
  pages: [
    {
      title: "Blog",
      href: "/blog",
      sections: [],
      subPages: [],
    },
    {
      title: "Docs",
      href: "/docs",
      sections: [],
      subPages: recursivelyGetDocsPages({
        pathToDirectory: "docs",
      }),
    },
    {
      title: "Roadmap",
      href: "/roadmap",
      sections: [],
      subPages: [],
    },
  ],
});
