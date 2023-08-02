import { Box, Tab, Tabs } from "@mui/material";
import { GetStaticPaths, GetStaticProps } from "next";
import { useRouter } from "next/router";
import { MDXRemoteSerializeResult } from "next-mdx-remote";
import { MouseEvent, useContext, useMemo } from "react";

import { Button } from "../../components/button";
import { FaIcon } from "../../components/icons/fa-icon";
import { PageLayout } from "../../components/page-layout";
import { NextPageWithLayout } from "../../util/next-types";
import { getSerializedDocsPage } from "../shared/mdx-utils";
import { SiteMapContext } from "../shared/site-map-context";
import { DocsContent } from "./docs-content";
import { DocsHomePage } from "./docs-home-page";
import { DocsSlugIcon } from "./docs-slug-icon";

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
  serializedPage?: MDXRemoteSerializeResult<Record<string, unknown>>;
};

export const getStaticProps: GetStaticProps<
  DocsPageProps,
  DocsPageParsedUrlQuery
> = async ({ params }) => {
  const docsSlug = params?.["docs-slug"] ?? [];

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
      props: { serializedPage },
    };
  } catch {
    return {
      props: {},
    };
  }
};

const DocsPage: NextPageWithLayout<DocsPageProps> = ({ serializedPage }) => {
  const router = useRouter();

  const { pages } = useContext(SiteMapContext);

  const docsPages = useMemo(() => {
    const docsPage = pages.find(({ title }) => title === "Docs");

    if (!docsPage) {
      throw new Error("Docs page not found in site map.");
    }

    return docsPage.subPages;
  }, [pages]);

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
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          background: ({ palette }) => palette.gray[10],
          px: 2.5,
          borderBottomColor: ({ palette }) => palette.gray[30],
          borderBottomWidth: 1,
          borderBottomStyle: "solid",
        }}
      >
        <Tabs value={currentDocsTab.href} aria-label="docs-tabs">
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
        <Button
          variant="tertiary"
          href="https://hash.ai/discord"
          startIcon={<FaIcon name="discord" type="brands" />}
          sx={{
            display: {
              xs: "none",
              md: "flex",
            },
            alignSelf: "center",
            minHeight: "unset",
            px: 1,
          }}
        >
          Chat to us on Discord
        </Button>
      </Box>

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
