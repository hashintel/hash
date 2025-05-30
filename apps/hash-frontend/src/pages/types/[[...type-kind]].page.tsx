import type { DataTypeRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type { DataTypeWithMetadata } from "@blockprotocol/type-system";
import { Box, Container, Stack, Typography } from "@mui/material";
import type { GetServerSideProps } from "next";
import { NextSeo } from "next-seo";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useBlockProtocolQueryDataTypes } from "../../components/hooks/block-protocol-functions/ontology/use-block-protocol-query-data-types";
import { useLatestEntityTypesOptional } from "../../shared/entity-types-context/hooks";
import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { FilesLightIcon } from "../../shared/icons/files-light-icon";
import { PlusRegularIcon } from "../../shared/icons/plus-regular";
import type { NextPageWithLayout } from "../../shared/layout";
import { getLayoutWithSidebar } from "../../shared/layout";
import { usePropertyTypes } from "../../shared/property-types-context";
import { CreateButton } from "../shared/create-button";
import { TopContextBar } from "../shared/top-context-bar";
import { TypesTable } from "../shared/types-table";
import {
  tabTitles,
  TypesPageTabs,
} from "./[[...type-kind]].page/types-page-tabs";

type ParsedQueryKindParam =
  | "entity-type"
  | "link-type"
  | "property-type"
  | "data-type";

type ParsedQueryParams = {
  ["type-kind"]?: ParsedQueryKindParam[];
};

export type TabId = "all" | ParsedQueryKindParam;

type TypesPageProps = {
  currentTab: TabId;
};

export const getServerSideProps: GetServerSideProps<
  TypesPageProps,
  ParsedQueryParams
  // eslint-disable-next-line @typescript-eslint/require-await
> = async ({ params }) => {
  const currentTab = params?.["type-kind"]?.[0] ?? "all";

  return { props: { currentTab } };
};

const contentMaxWidth = 1000;

const TypesPage: NextPageWithLayout<TypesPageProps> = ({ currentTab }) => {
  const { latestEntityTypes } = useLatestEntityTypesOptional({
    includeArchived: true,
  });

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const latestNonLinkEntityTypes = useMemo(
    () =>
      isSpecialEntityTypeLookup
        ? latestEntityTypes?.filter(
            (entityType) =>
              !isSpecialEntityTypeLookup[entityType.schema.$id]?.isLink,
          )
        : undefined,
    [isSpecialEntityTypeLookup, latestEntityTypes],
  );

  const latestLinkEntityTypes = useMemo(
    () =>
      isSpecialEntityTypeLookup
        ? latestEntityTypes?.filter(
            (entityType) =>
              isSpecialEntityTypeLookup[entityType.schema.$id]?.isLink,
          )
        : undefined,
    [isSpecialEntityTypeLookup, latestEntityTypes],
  );

  const { queryDataTypes } = useBlockProtocolQueryDataTypes();

  const { propertyTypes: latestPropertyTypesObject } = usePropertyTypes({
    latestOnly: true,
    includeArchived: true,
  });

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
          ? latestNonLinkEntityTypes
          : currentTab === "link-type"
            ? latestLinkEntityTypes
            : currentTab === "property-type"
              ? latestPropertyTypes
              : latestDataTypes,
    [
      currentTab,
      allTypes,
      latestNonLinkEntityTypes,
      latestLinkEntityTypes,
      latestPropertyTypes,
      latestDataTypes,
    ],
  );

  const maxWidth = { lg: `max(${contentMaxWidth}, "70%")` } as const;

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
                  href: `/types/${currentTab}`,
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
        <Container sx={{ maxWidth }}>
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
          <Stack direction="row" justifyContent="space-between">
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
            <CreateButton
              href="/new/types/entity-type"
              variant="tertiary_quiet"
              endIcon={<PlusRegularIcon />}
            >
              Create type
            </CreateButton>
          </Stack>
        </Container>
      </Box>
      <Container sx={{ paddingTop: 5, maxWidth }}>
        <TypesTable kind={currentTab} types={currentTypes} />
      </Container>
    </>
  );
};

TypesPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default TypesPage;
