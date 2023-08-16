import { DataTypeRootType, DataTypeWithMetadata } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box, Container, Typography } from "@mui/material";
import { GetStaticPaths, GetStaticProps } from "next";
import { NextSeo } from "next-seo";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useBlockProtocolQueryDataTypes } from "../../components/hooks/block-protocol-functions/ontology/use-block-protocol-query-data-types";
import { useLatestEntityTypesOptional } from "../../shared/entity-types-context/hooks";
import { isLinkEntityType } from "../../shared/entity-types-context/util";
import { FilesLightIcon } from "../../shared/icons/files-light-icon";
import { useLatestPropertyTypes } from "../../shared/latest-property-types-context";
import { getLayoutWithSidebar, NextPageWithLayout } from "../../shared/layout";
import { TopContextBar } from "../shared/top-context-bar";
import { tabTitles, TypesPageTabs } from "./types-page-tabs";
import { TypesTable } from "./types-table";

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

const contentMaxWidth = 1000;

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

  const { queryDataTypes } = useBlockProtocolQueryDataTypes();

  const latestPropertyTypesObject = useLatestPropertyTypes();

  const latestPropertyTypes = useMemo(
    () =>
      latestPropertyTypesObject
        ? Object.values(latestPropertyTypesObject)
        : undefined,
    [latestPropertyTypesObject],
  );

  const [latestDataTypes, setLatestDataTypes] =
    useState<DataTypeWithMetadata[]>();

  const fetchDataTypes = useCallback(
    async () =>
      await queryDataTypes({ data: {} }).then(({ data: dataTypesSubgraph }) => {
        if (dataTypesSubgraph) {
          setLatestDataTypes(getRoots<DataTypeRootType>(dataTypesSubgraph));
        }
      }),
    [queryDataTypes],
  );

  useEffect(() => {
    void fetchDataTypes();
  }, [fetchDataTypes]);

  const allTypes = useMemo(
    () =>
      latestNonLinkEntityTypes &&
      latestLinkEntityTypes &&
      latestPropertyTypes &&
      latestDataTypes
        ? [
            ...latestNonLinkEntityTypes,
            ...latestLinkEntityTypes,
            ...latestPropertyTypes,
            ...latestDataTypes,
          ]
        : undefined,
    [
      latestNonLinkEntityTypes,
      latestLinkEntityTypes,
      latestPropertyTypes,
      latestDataTypes,
    ],
  );

  const currentTypes = useMemo(
    () =>
      currentTab === "all"
        ? allTypes
        : currentTab === "entity-type"
        ? latestNonLinkEntityTypes ?? []
        : currentTab === "link-type"
        ? latestLinkEntityTypes ?? []
        : currentTab === "property-type"
        ? latestPropertyTypes ?? []
        : latestDataTypes ?? [],
    [
      currentTab,
      allTypes,
      latestNonLinkEntityTypes,
      latestLinkEntityTypes,
      latestPropertyTypes,
      latestDataTypes,
    ],
  );

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
        <Container sx={{ maxWidth: { lg: contentMaxWidth } }}>
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
          <TypesPageTabs
            currentTab={currentTab}
            numberOfTypesByTab={{
              all: allTypes?.length,
              "entity-type": latestNonLinkEntityTypes?.length,
              "link-type": latestLinkEntityTypes?.length,
              "property-type": latestPropertyTypes?.length,
              "data-type": latestDataTypes?.length,
            }}
          />
        </Container>
      </Box>
      <Container sx={{ paddingTop: 5, maxWidth: { lg: contentMaxWidth } }}>
        <TypesTable kind={currentTab} types={currentTypes ?? []} />
      </Container>
    </>
  );
};

TypesPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default TypesPage;
