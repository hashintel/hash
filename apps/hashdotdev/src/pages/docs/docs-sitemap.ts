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

export const generateDocsSiteMap = (): SiteMap => ({
  pages: [
    {
      title: "Getting Started",
      href: "/docs/get-started",
      sections: [],
      subPages: [...getAllDocsPages({ pathToDirectory: "docs/get-started" })],
    },
    {
      title: "Apps",
      href: "/docs/apps",
      sections: [],
      subPages: [...getAllDocsPages({ pathToDirectory: "docs/apps" })],
    },
  ],
});
