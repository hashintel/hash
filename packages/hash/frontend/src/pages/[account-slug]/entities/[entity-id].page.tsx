import { useQuery } from "@apollo/client";
import {
  BlockGraph,
  EmbedderGraphMessageCallbacks,
} from "@blockprotocol/graph";
import { useRouter } from "next/router";
import { useMemo, useRef } from "react";

import { getEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { Box, styled } from "@mui/material";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { SimpleEntityEditor } from "./shared/simple-entity-editor";

import {
  GetEntityQuery,
  GetEntityQueryVariables,
} from "../../../graphql/apiTypes.gen";
import { useBlockProtocolUpdateEntity } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateEntity";
import {
  convertApiEntitiesToBpEntities,
  convertApiLinkGroupsToBpLinkGroups,
  generateEntityLabel,
  rewriteEntityIdentifier,
} from "../../../lib/entities";
import { useBlockProtocolAggregateEntities } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolAggregateEntities";
import { useBlockProtocolDeleteLink } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolDeleteLink";
import { useBlockProtocolCreateLink } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolCreateLink";
import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../shared/layout";
import { BlockBasedEntityEditor } from "./[entity-id].page/block-based-entity-editor";
import { useRouteAccountInfo } from "../../../shared/routing";
import {
  TopContextBar,
  TOP_CONTEXT_BAR_HEIGHT,
} from "../../shared/top-context-bar";
import { HEADER_HEIGHT } from "../../../shared/layout/layout-with-header/page-header";

const Container = styled("div")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "1fr minmax(65ch, 1200px) 1fr",
  padding: theme.spacing(7, 10),

  "& > *": {
    gridColumn: "2",
  },
}));

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { query } = router;
  const { accountId } = useRouteAccountInfo();
  const entityId = query["entity-id"] as string;
  const pageHeaderRef = useRef<HTMLElement>();

  const { data, refetch } = useQuery<GetEntityQuery, GetEntityQueryVariables>(
    getEntity,
    {
      variables: {
        accountId,
        entityId,
      },
    },
  );
  const { createLink } = useBlockProtocolCreateLink();
  const { deleteLink } = useBlockProtocolDeleteLink();
  const { updateEntity } = useBlockProtocolUpdateEntity();
  const { aggregateEntities } = useBlockProtocolAggregateEntities(accountId);

  const updateAndNavigateToFirstEntity: EmbedderGraphMessageCallbacks["updateEntity"] =
    (args) => {
      return updateEntity(args)
        .then((res) => {
          if (!res.data) {
            throw new Error("No data returned from updateEntity call");
          }
          void router.push(`/${accountId}/entities/${res.data.entityId}`);
          return res;
        })
        .catch((err) => {
          // eslint-disable-next-line no-console -- TODO: consider using logger
          console.error(`Error updating entity: ${err.message}`);
          throw err;
        });
    };

  const entity = data?.entity;

  const blockGraph = useMemo<BlockGraph>(() => {
    return {
      depth: 1,
      linkedEntities: convertApiEntitiesToBpEntities(
        entity?.linkedEntities ?? [],
      ),
      linkGroups: convertApiLinkGroupsToBpLinkGroups(entity?.linkGroups ?? []),
    };
  }, [entity]);

  const scrollToTop = () => {
    if (!pageHeaderRef.current) return;
    pageHeaderRef.current.scrollIntoView({
      behavior: "smooth",
    });
  };

  const entityDisplayName = entity
    ? generateEntityLabel(entity, entity.entityType.properties)
    : undefined;

  const crumbs = !entity
    ? []
    : [
        {
          title: entity.entityType.properties.title,
          href: entity.entityType.properties.$id,
          id: entityId,
        },
        {
          title: entityDisplayName,
          href: `/${accountId}/entities/${entityId}`,
          id: entityId,
        },
      ];

  return (
    <>
      <Box
        sx={({ zIndex, palette }) => ({
          position: "sticky",
          top: 0,
          zIndex: zIndex.appBar,
          backgroundColor: palette.white,
        })}
      >
        <TopContextBar
          crumbs={crumbs}
          defaultCrumbIcon={<FontAwesomeIcon icon={faAsterisk} />}
          scrollToTop={scrollToTop}
        />
      </Box>
      <Container>
        <Box
          ref={pageHeaderRef}
          sx={{
            scrollMarginTop: HEADER_HEIGHT + TOP_CONTEXT_BAR_HEIGHT,
          }}
          component="header"
        >
          <h1>
            <strong>
              {entity ? `Editing '${entityDisplayName}'` : "Loading..."}
            </strong>
          </h1>
        </Box>
        <Box>
          {entity && (
            <SimpleEntityEditor
              aggregateEntities={aggregateEntities}
              blockGraph={blockGraph}
              createLink={createLink}
              deleteLink={deleteLink}
              entityId={rewriteEntityIdentifier({
                accountId,
                entityId,
              })}
              updateEntity={updateAndNavigateToFirstEntity}
              entityProperties={entity.properties}
              refetchEntity={refetch}
              schema={entity.entityType.properties}
            />
          )}
        </Box>
      </Container>
    </>
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

const BlockBasedEntityPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { query } = router;
  const { accountId } = useRouteAccountInfo();
  const entityId = query["entity-id"] as string;

  return <BlockBasedEntityEditor accountId={accountId} entityId={entityId} />;
};

BlockBasedEntityPage.getLayout = getLayoutWithSidebar;

export default process.env.NEXT_PUBLIC_BLOCK_BASED_ENTITY_EDITOR === "true"
  ? BlockBasedEntityPage
  : Page;
