import { Tab, Tabs } from "@mui/material";
import { useRouter } from "next/router";
import { MouseEvent, ReactNode } from "react";

import { PageLayout } from "../../components/page-layout";
import { NextPageWithLayout } from "../../util/next-types";
import { DocsHomePage } from "./docs-home-page";
import { DocsSlugIcon } from "./docs-slug-icon";
import { GettingStartedPage } from "./getting-started-page";

const docsPages: { title: string; href: string; Page: ReactNode }[] = [
  {
    title: "Home",
    href: "/docs",
    Page: <DocsHomePage />,
  },
  {
    title: "Getting Started",
    href: "/docs/getting-started",
    Page: <GettingStartedPage />,
  },
];

type DocsPageParsedUrlQuery = {
  "docs-slug"?: string[];
};

const DocsPage: NextPageWithLayout = () => {
  const router = useRouter();

  const docsPageSlugs =
    (router.query as DocsPageParsedUrlQuery)["docs-slug"] ?? [];

  const currentDocsPage = docsPages.find(
    ({ href }) =>
      href === `/docs${docsPageSlugs[0] ? `/${docsPageSlugs[0]}` : ""}`,
  );

  if (!currentDocsPage) {
    void router.push(docsPages[0]!.href);
  }

  return (
    <>
      <Tabs
        sx={{ background: ({ palette }) => palette.gray[10], px: 2.5 }}
        value={currentDocsPage?.href}
        aria-label="docs-tabs"
      >
        {docsPages.map(({ href, title }) => (
          <Tab
            key={href}
            label={title}
            value={href}
            href={href}
            component="a"
            onClick={(event: MouseEvent) => {
              event.preventDefault();
              void router.push(href);
            }}
          />
        ))}
      </Tabs>
      {currentDocsPage?.Page}
    </>
  );
};

DocsPage.getLayout = (page) => (
  <PageLayout
    subscribe={false}
    contentWrapperSx={{ py: { xs: 0, md: 0 } }}
    navbarSx={{ background: ({ palette }) => palette.gray[10] }}
    navbarLogoEndAdornment={
      <DocsSlugIcon sx={{ height: 20, width: 66, marginLeft: -2.25 }} />
    }
  >
    {page}
  </PageLayout>
);

export default DocsPage;
