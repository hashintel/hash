import { Box, Tab, Tabs, tabsClasses } from "@mui/material";
import { GetStaticPaths, GetStaticProps } from "next";
import { useRouter } from "next/router";
import { MDXRemoteSerializeResult } from "next-mdx-remote";
import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";

import siteMap from "../../../sitemap.json";
import { Button } from "../../components/button";
import { DiscordIcon } from "../../components/icons/discord-icon";
import { PageLayout } from "../../components/page-layout";
import { NextPageWithLayout } from "../../util/next-types";
import { DocsPageData, getSerializedDocsPage } from "../shared/mdx-utils";
import { SiteMap, SiteMapPage } from "../shared/sitemap";
import { DocsContent } from "./docs-content";
import { DocsHomePage } from "./docs-home-page";
import { DocsSlugIcon } from "./docs-slug-icon";

type DocsPageParsedUrlQuery = {
  "docs-slug"?: string[];
};

type DocsPageProps = {
  docsSlug: string[];
  serializedPage?: MDXRemoteSerializeResult<DocsPageData>;
};

const topLevelDocsPages = (siteMap as SiteMap).pages.find(
  ({ title }) => title === "Docs",
)!.subPages;

const docsTabs: { title: string; href: string }[] = [
  /**
   * Temporarily hide the "Home" tab, while we don't want to display
   * the `/docs` page.
   */
  // {
  //   title: "Home",
  //   href: "/docs",
  // },
  ...topLevelDocsPages.map(
    ({ title, titleDerivedFromDirectoryName, href }) => ({
      /**
       * We prefer the title derived from the directory name, so that
       * for example the the `Simulations` tab can have its first page
       * be titled `Overview` in the sidebar.
       */
      title: titleDerivedFromDirectoryName ?? title,
      href,
    }),
  ),
];

const getPossibleHrefsInPage = (page: SiteMapPage): string[] => {
  const subPages = page.subPages.flatMap(getPossibleHrefsInPage);

  return [page.href, ...subPages];
};

export const getStaticPaths: GetStaticPaths<DocsPageParsedUrlQuery> = () => {
  const possibleHrefs = [
    "/docs",
    ...topLevelDocsPages.flatMap(getPossibleHrefsInPage),
  ];

  const paths = possibleHrefs.map((href) => ({
    params: {
      "docs-slug": href
        .replace("/docs", "")
        .split("/")
        .filter((item) => !!item),
    },
  }));

  return {
    paths,
    fallback: false,
  };
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
      props: { serializedPage, docsSlug },
    };
  } catch {
    return {
      props: { docsSlug },
    };
  }
};

const DocsPage: NextPageWithLayout<DocsPageProps> = ({
  serializedPage,
  docsSlug,
}) => {
  const router = useRouter();

  const tabsRef = useRef<HTMLDivElement>(null);

  const [isLastTabVisible, setIsLastTabVisible] = useState(true);
  const [isFirstTabVisible, setIsFirstTabVisible] = useState(true);

  useEffect(() => {
    const tabsElement = tabsRef.current;

    const tabsScrollerElement = tabsElement?.getElementsByClassName(
      tabsClasses.scroller,
    )[0] as HTMLDivElement | undefined;

    if (tabsScrollerElement) {
      const handleScroll = () => {
        const { scrollWidth, clientWidth, scrollLeft } = tabsScrollerElement;
        const isScrolledToStart = scrollLeft === 0;

        const isScrolledToEnd =
          scrollWidth - Math.round(scrollLeft + clientWidth) <= 0;

        setIsFirstTabVisible(isScrolledToStart);
        setIsLastTabVisible(isScrolledToEnd);
      };

      handleScroll();

      tabsScrollerElement.addEventListener("wheel", handleScroll);
      tabsScrollerElement.addEventListener("scroll", handleScroll);

      return () => {
        tabsScrollerElement.removeEventListener("wheel", handleScroll);
        tabsScrollerElement.removeEventListener("scroll", handleScroll);
      };
    }
  }, []);

  const currentDocsTab = useMemo(() => {
    const tab = docsTabs.find(
      ({ href }) => href === `/docs${docsSlug[0] ? `/${docsSlug[0]}` : ""}`,
    );

    // If no matching tab is found, perform a client-side redirect to the first tab.
    if (!tab && typeof window !== "undefined") {
      void router.push(docsTabs[0]!.href);
    }

    return tab;
  }, [router, docsSlug]);

  const sectionPages = useMemo(() => {
    const topLevelDocsPage = currentDocsTab
      ? topLevelDocsPages.find(({ href }) => href === currentDocsTab.href)
      : undefined;

    if (!topLevelDocsPage) {
      return [];
    }

    return [
      { ...topLevelDocsPage, subPages: [] },
      ...topLevelDocsPage.subPages,
    ];
  }, [currentDocsTab]);

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
        <Tabs
          ref={tabsRef}
          scrollButtons={false}
          variant="scrollable"
          value={currentDocsTab.href}
          aria-label="docs-tabs"
          sx={{
            flexGrow: 1,
            position: "relative",
            marginRight: {
              xs: 0,
              md: 2,
            },
            "&::before": {
              content: "''",
              position: "absolute",
              top: 0,
              left: 0,
              width: 50,
              height: "100%",
              transition: ({ transitions }) => transitions.create("opacity"),
              opacity: isFirstTabVisible ? 0 : 1,
              background: ({ palette }) =>
                `linear-gradient(to left, ${palette.gray[10]}00, ${palette.gray[10]}FF)`,
              zIndex: isFirstTabVisible ? -1 : 1,
            },
            "&::after": {
              content: "''",
              position: "absolute",
              top: 0,
              right: 0,
              width: 50,
              height: "100%",
              transition: ({ transitions }) => transitions.create("opacity"),
              opacity: isLastTabVisible ? 0 : 1,
              zIndex: isLastTabVisible ? -1 : 1,
              background: ({ palette }) =>
                `linear-gradient(to right, ${palette.gray[10]}00, ${palette.gray[10]}FF)`,
            },
          }}
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
        <Button
          variant="tertiary"
          href="https://hash.ai/discord"
          startIcon={<DiscordIcon />}
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
          title={serializedPage.scope?.title}
          subtitle={serializedPage.scope?.subtitle}
          content={serializedPage}
          sectionPages={sectionPages}
        />
      ) : null}
    </>
  ) : null;
};

DocsPage.getLayout = (page, asPath) => {
  const isDocsHomePage = asPath === "/docs";

  return (
    <PageLayout
      subscribe={false}
      contentWrapperSx={{
        py: { xs: 0, md: 0 },
        "& > div::before": {
          background: isDocsHomePage
            ? "linear-gradient(183deg, #E8F4F6 0%, rgba(244, 253, 255, 0.00) 100%)"
            : "linear-gradient(183deg, #E5F0F2 0%, rgba(237, 248, 250, 0.00) 100%)",
        },
      }}
      navbarSx={{ background: ({ palette }) => palette.gray[10] }}
      navbarContainerSx={{
        px: {
          md: 2.5,
        },
        maxWidth: {
          lg: "unset",
        },
      }}
      navbarLogoEndAdornment={
        <DocsSlugIcon sx={{ height: 19, width: 70, marginLeft: -2.5 }} />
      }
    >
      {page}
    </PageLayout>
  );
};

export default DocsPage;
