import {
  Box,
  Breadcrumbs,
  Collapse,
  Container,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useRouter } from "next/router";
import { MDXRemoteSerializeResult } from "next-mdx-remote";
import { FunctionComponent, ReactNode } from "react";

import { FaIcon } from "../../components/icons/fa-icon";
import { Link } from "../../components/link";
import { MdxPageContent } from "../../components/mdx-page-content";
import { SiteMapPage } from "./docs-sitemap";
import { PageNavLinks } from "./page-nav-links";
import { generatePathWithoutParams, Sidebar } from "./page-sidebar";

type DocsPageProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  content: MDXRemoteSerializeResult<Record<string, unknown>>;
  sectionPages: SiteMapPage[];
};

const mdxContentMaxWidth = 1000;

const mdxParagraphMaxWidth = 750;

const getParentPages = (
  pages: SiteMapPage[],
  currentPage: SiteMapPage,
): SiteMapPage[] | null => {
  for (const page of pages) {
    if (page.href === currentPage.href) {
      return [];
    }
    const subParents = getParentPages(page.subPages, currentPage);
    if (subParents) {
      return [page, ...subParents];
    }
  }
  return null;
};

export const DocsContent: FunctionComponent<DocsPageProps> = ({
  title,
  subtitle,
  content,
  sectionPages,
}) => {
  const { asPath } = useRouter();
  const theme = useTheme();
  const md = useMediaQuery(theme.breakpoints.up("md"));

  const pathWithoutParams = generatePathWithoutParams(asPath);

  const flatSubPages = sectionPages.flatMap((page) => [page, ...page.subPages]);

  const currentPage = flatSubPages.find(
    ({ href }) =>
      pathWithoutParams === href || pathWithoutParams.startsWith(`${href}#`),
  );

  const currentPageIndex = currentPage ? flatSubPages.indexOf(currentPage) : -1;

  const prevPage =
    currentPageIndex > 0 ? flatSubPages[currentPageIndex - 1] : undefined;

  const nextPage =
    currentPageIndex < flatSubPages.length - 1
      ? flatSubPages[currentPageIndex + 1]
      : undefined;

  const hasMultiplePages = flatSubPages.length > 0;

  const parents = currentPage
    ? getParentPages(sectionPages, currentPage)
    : null;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "stretch",
        gap: {
          xs: 0,
          lg: 10,
        },
      }}
    >
      <Box
        sx={(sxTheme) => ({
          display: "flex",
          flexGrow: 0,
          flexShrink: 0,
          // Hide the sidebar on small screen widths
          [sxTheme.breakpoints.down("md")]: { display: "none" },
        })}
      >
        <Sidebar
          isSsrSafe={false}
          pages={sectionPages}
          sx={{ paddingTop: 1.75 }}
        />
        {/* The right border of the sidebar */}
        <Box
          sx={{
            flexShrink: 0,
            width: "1px",
            background: ({ palette }) =>
              `linear-gradient(180deg, ${palette.gray[30]} 0%, ${palette.gray[30]} 70%, transparent 100%)`,
            position: "relative",
          }}
        />
      </Box>
      <Container
        sx={{
          margin: 0,
          width: "inherit",
          maxWidth: mdxContentMaxWidth,
          minWidth: 0,
        }}
      >
        {title ? (
          <Typography
            variant="hashLargeTitle"
            sx={{
              marginBottom: 2,
            }}
          >
            {title}
          </Typography>
        ) : null}
        {subtitle ? (
          <Typography
            variant="h2"
            maxWidth={750}
            sx={{
              marginBottom: 6,
            }}
          >
            {subtitle}
          </Typography>
        ) : null}
        {parents ? (
          <Collapse in={md && parents.length > 0}>
            <Breadcrumbs
              separator={
                <FaIcon
                  sx={{
                    fontSize: 14,
                    color: ({ palette }) => palette.gray[40],
                  }}
                  name="chevron-right"
                  type="regular"
                />
              }
              sx={{ marginBottom: 2, marginLeft: 0.25 }}
            >
              {parents.map(({ href, title: parentTitle }, i, all) => (
                <Link
                  key={href}
                  href={href}
                  sx={{
                    textTransform: "uppercase",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {parentTitle}
                  {i === all.length - 1 ? (
                    <FaIcon
                      sx={{
                        fontSize: 14,
                        color: ({ palette }) => palette.gray[40],
                        marginLeft: 1,
                      }}
                      name="chevron-right"
                      type="regular"
                    />
                  ) : null}
                </Link>
              ))}
            </Breadcrumbs>
          </Collapse>
        ) : null}

        <Box mb={hasMultiplePages ? 4 : 0}>
          <MdxPageContent
            paragraphMaxWidth={mdxParagraphMaxWidth}
            serializedPage={content}
          />
        </Box>
        {hasMultiplePages ? (
          <PageNavLinks
            prevPage={prevPage}
            nextPage={nextPage}
            sx={{
              maxWidth: {
                sx: "100%",
                sm: mdxParagraphMaxWidth,
              },
              marginBottom: {
                xs: 8,
                md: 14,
              },
            }}
          />
        ) : null}
      </Container>
    </Box>
  );
};
