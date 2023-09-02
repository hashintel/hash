import { getAllDocsPages } from "./mdx-utils";

export type SiteMapPageSection = {
  title: string;
  anchor: string;
  subSections: SiteMapPageSection[];
};

export type SiteMapPage = {
  title: string;
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
      subPages: [
        {
          title: "Getting Started",
          href: "/docs/get-started",
          sections: [],
          subPages: [
            ...getAllDocsPages({ pathToDirectory: "docs/get-started" }),
          ],
        },
        {
          title: "Apps",
          href: "/docs/apps",
          sections: [],
          subPages: [...getAllDocsPages({ pathToDirectory: "docs/apps" })],
        },
      ],
    },

    {
      title: "Roadmap",
      href: "/roadmap",
      sections: [],
      subPages: [],
    },
  ],
});
