import {
  Box,
  Breadcrumbs,
  Collapse,
  Container,
  Divider,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useRouter } from "next/router";
import { MDXRemoteSerializeResult } from "next-mdx-remote";
import { FunctionComponent, ReactNode } from "react";

import { ChevronRightRegularIcon } from "../../components/icons/chevron-right-regular-icon";
import { Link } from "../../components/link";
import { MdxPageContent } from "../../components/mdx-page-content";
import { DocsPageData } from "../shared/mdx-utils";
import { generatePathWithoutParams } from "../shared/page-utils";
import { SiteMapPage } from "../shared/sitemap";
import { PageNavLinks } from "./page-nav-links";
import { Sidebar } from "./page-sidebar";

type DocsPageProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  content: MDXRemoteSerializeResult<DocsPageData>;
  sectionPages: SiteMapPage[];
};

const mdxContentMaxWidth = 1125;

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
          [theme.breakpoints.up("sm")]: {
            maxWidth: mdxContentMaxWidth,
          },
          [theme.breakpoints.up("xl")]: {
            maxWidth: mdxContentMaxWidth,
          },
          minWidth: 0,
          paddingTop: {
            xs: 3,
            md: 8,
          },
        }}
      >
        <Typography variant="hashLargeTitle" marginBottom={2.5}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography
            variant="hashLargeText"
            sx={{
              color: ({ palette }) => palette.gray[80],
              marginBottom: 6,
              maxWidth: 750,
            }}
          >
            {subtitle}
          </Typography>
        ) : null}
        <Divider sx={{ borderColor: ({ palette }) => palette.gray[30] }} />
        {parents ? (
          <Collapse in={md && parents.length > 0}>
            <Breadcrumbs
              separator={
                <ChevronRightRegularIcon
                  sx={{
                    fontSize: 14,
                    color: ({ palette }) => palette.gray[40],
                  }}
                />
              }
              sx={{ marginY: 2, marginLeft: 0.25 }}
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
                    <ChevronRightRegularIcon
                      sx={{
                        fontSize: 14,
                        color: ({ palette }) => palette.gray[40],
                        marginLeft: 1,
                      }}
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
            wrapperSx={{
              "& > *:first-child": {
                marginTop: 6,
              },
            }}
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
