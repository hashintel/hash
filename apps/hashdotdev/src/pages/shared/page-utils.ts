import type { SiteMapPage, SiteMapPageSection } from "./sitemap";

export const generatePathWithoutParams = (path: string) => {
  const pathWithoutParams = path.match(/^[^?]*/)?.[0];
  if (!pathWithoutParams) {
    throw new Error(`Invalid path ${path}`);
  }
  return pathWithoutParams;
};

export const pageHasSelectedSubSection = (params: {
  href: string;
  sections: SiteMapPageSection[];
  pathWithoutParams: string;
}): boolean => {
  const { href, sections, pathWithoutParams } = params;

  for (const section of sections) {
    const { anchor } = section;

    if (
      pathWithoutParams === `${href}#${anchor}` ||
      pageHasSelectedSubSection({
        href,
        sections: section.subSections,
        pathWithoutParams,
      })
    ) {
      return true;
    }
  }
  return false;
};

export const pageHasOpenSubPage = (params: {
  subPages: SiteMapPage[];
  pathWithoutParams: string;
}): boolean => {
  const { subPages, pathWithoutParams } = params;

  for (const subPage of subPages) {
    const { href } = subPage;

    if (
      pathWithoutParams === href ||
      pathWithoutParams === `${href}#` ||
      pageHasOpenSubPage({
        subPages: subPage.subPages,
        pathWithoutParams,
      }) ||
      pageHasSelectedSubSection({
        href,
        sections: subPage.sections,
        pathWithoutParams,
      })
    ) {
      return true;
    }
  }
  return false;
};
