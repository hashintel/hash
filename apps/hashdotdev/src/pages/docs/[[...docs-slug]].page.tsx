import { Tab, Tabs } from "@mui/material";
import { GetStaticPaths, GetStaticProps } from "next";
import { useRouter } from "next/router";
import { MDXRemoteSerializeResult } from "next-mdx-remote";
import { MouseEvent, useMemo } from "react";

import { PageLayout } from "../../components/page-layout";
import { NextPageWithLayout } from "../../util/next-types";
import { DocsContent } from "./docs-content";
import { DocsHomePage } from "./docs-home-page";
import { generateDocsSiteMap, SiteMapPage } from "./docs-sitemap";
import { DocsSlugIcon } from "./docs-slug-icon";
import { getSerializedDocsPage } from "./mdx-utils";

const docsTabs: { title: string; href: string }[] = [
  {
    title: "Home",
    href: "/docs",
  },
  {
    title: "Getting Started",
    href: "/docs/get-started",
  },
  {
    title: "Apps",
    href: "/docs/apps",
  },
];

type DocsPageParsedUrlQuery = {
  "docs-slug"?: string[];
};

export const getStaticPaths: GetStaticPaths = () => {
  return {
    paths: [],
    fallback: true,
  };
};

type DocsPageProps = {
  docsPages: SiteMapPage[];
  docsSlug: string[];
  serializedPage?: MDXRemoteSerializeResult<Record<string, unknown>>;
};

export const getStaticProps: GetStaticProps<
  DocsPageProps,
  DocsPageParsedUrlQuery
> = async ({ params }) => {
  const docsSlug = params?.["docs-slug"] ?? [];

  const { pages: docsPages } = generateDocsSiteMap();

  // As of Jan 2022, { fallback: false } in getStaticPaths does not prevent Vercel
  // from calling getStaticProps for unknown pages. This causes 500 instead of 404:
  //
  //   Error: ENOENT: no such file or directory, open '{...}/_pages/docs/undefined'
  //
  // Using try / catch prevents 500, but we might not need them in Next v12+.
  try {
    const serializedPage = await getSerializedDocsPage({
      pathToDirectory: "docs",
      parts: docsSlug.length ? docsSlug : ["index"],
    });

    return {
      props: { docsPages, serializedPage, docsSlug },
    };
  } catch {
    return {
      props: { docsPages, docsSlug },
    };
  }
};

const DocsPage: NextPageWithLayout<DocsPageProps> = ({
  serializedPage,
  docsPages,
}) => {
  const router = useRouter();

  const currentDocsTab = useMemo(() => {
    const docsPageSlugs =
      (router.query as DocsPageParsedUrlQuery)["docs-slug"] ?? [];

    const tab = docsTabs.find(
      ({ href }) =>
        href === `/docs${docsPageSlugs[0] ? `/${docsPageSlugs[0]}` : ""}`,
    );

    // If no matching tab is found, redirect to the docs homepage.
    if (router.isReady && !tab) {
      void router.push(docsTabs[0]!.href);
    }

    return tab;
  }, [router]);

  const isHomePage = currentDocsTab && currentDocsTab.href === "/docs";

  return currentDocsTab ? (
    <>
      <Tabs
        sx={{
          background: ({ palette }) => palette.gray[10],
          px: 2.5,
          borderBottomColor: ({ palette }) => palette.gray[30],
          borderBottomWidth: 1,
          borderBottomStyle: "solid",
        }}
        value={currentDocsTab.href}
        aria-label="docs-tabs"
      >
        {docsTabs.map(({ href, title }) => (
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
      {isHomePage ? (
        <DocsHomePage />
      ) : serializedPage ? (
        <DocsContent
          content={serializedPage}
          sectionPages={
            docsPages.find(({ href }) => href === currentDocsTab.href)!.subPages
          }
        />
      ) : null}
    </>
  ) : null;
};

DocsPage.getLayout = (page) => (
  <PageLayout
    subscribe={false}
    contentWrapperSx={{
      py: { xs: 0, md: 0 },
      "& > div::before": {
        background:
          "linear-gradient(183deg, #E8F4F6 0%, rgba(244, 253, 255, 0.00) 100%)",
      },
    }}
    navbarSx={{ background: ({ palette }) => palette.gray[10] }}
    navbarLogoEndAdornment={
      <DocsSlugIcon sx={{ height: 20, width: 66, marginLeft: -2.25 }} />
    }
  >
    {page}
  </PageLayout>
);

export default DocsPage;
