import { Box, Container, Typography } from "@mui/material";
import { GetStaticPaths, GetStaticProps } from "next";
import { NextSeo } from "next-seo";
import { useMemo } from "react";

import { useLatestEntityTypesOptional } from "../../shared/entity-types-context/hooks";
import { isLinkEntityType } from "../../shared/entity-types-context/util";
import { FilesLightIcon } from "../../shared/icons/files-light-icon";
import { getLayoutWithSidebar, NextPageWithLayout } from "../../shared/layout";
import { useLatestPropertyTypes } from "../[shortname]/types/entity-type/[...slug-maybe-version].page/shared/latest-property-types-context";
import { TopContextBar } from "../shared/top-context-bar";
import { tabTitles, TypesPageTabs } from "./types-page-tabs";

const parsedQueryParams = [
  "entity-type",
  "link-type",
  "property-type",
  "data-type",
] as const;

type ParsedQueryKindParam = (typeof parsedQueryParams)[number];

type ParsedQueryParams = {
  ["type-kind"]?: ParsedQueryKindParam[];
};

export const getStaticPaths: GetStaticPaths<ParsedQueryParams> = () => ({
  paths: [
    { params: { "type-kind": [] } },
    ...parsedQueryParams.map((kind) => ({ params: { "type-kind": [kind] } })),
  ],
  fallback: false,
});

export type TabId = "all" | ParsedQueryKindParam;

type TypesPageProps = {
  currentTab: TabId;
};

export const getStaticProps: GetStaticProps<
  TypesPageProps,
  ParsedQueryParams
> = ({ params }) => {
  const currentTab = params?.["type-kind"]?.[0] ?? "all";

  return { props: { currentTab } };
};

const TypesPage: NextPageWithLayout<TypesPageProps> = ({ currentTab }) => {
  const latestEntityTypes = useLatestEntityTypesOptional({
    includeArchived: true,
  });

  const latestNonLinkEntityTypes = useMemo(
    () =>
      latestEntityTypes?.filter(
        (entityType) => !isLinkEntityType(entityType.schema),
      ),
    [latestEntityTypes],
  );

  const latestLinkEntityTypes = useMemo(
    () =>
      latestEntityTypes?.filter((entityType) =>
        isLinkEntityType(entityType.schema),
      ),
    [latestEntityTypes],
  );

  const latestPropertyTypes = useLatestPropertyTypes();

  const latestDataTypes = [];

  return (
    <>
      <NextSeo title="Types" />
      <TopContextBar
        defaultCrumbIcon={null}
        crumbs={[
          {
            title: "Types",
            href: "/types",
            id: "types",
          },
          ...(currentTab !== "all"
            ? [
                {
                  title: tabTitles[currentTab],
                  href: `/types/${tabTitles[currentTab]}`,
                  id: currentTab,
                },
              ]
            : []),
        ]}
        scrollToTop={() => {}}
      />
      <Box
        sx={{
          borderBottom: 1,
          borderColor: ({ palette }) => palette.gray[20],
          pt: 3.75,
          backgroundColor: ({ palette }) => palette.common.white,
        }}
      >
        <Container>
          <Typography variant="h1" fontWeight="bold" my={3}>
            <Box display="inline-flex">
              <FilesLightIcon
                sx={({ palette }) => ({
                  fontSize: 40,
                  mr: 2,
                  stroke: palette.gray[50],
                  verticalAlign: "middle",
                })}
              />
            </Box>
            Types
          </Typography>
          <TypesPageTabs currentTab={currentTab} />
        </Container>
      </Box>
    </>
  );
};

TypesPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default TypesPage;
