import { useQuery } from "@apollo/client";
import {
  BlockGraph,
  EmbedderGraphMessageCallbacks,
} from "@blockprotocol/graph";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { getEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { SimpleEntityEditor } from "./shared/simple-entity-editor";

import {
  GetEntityQuery,
  GetEntityQueryVariables,
} from "../../../graphql/apiTypes.gen";
import { useBlockProtocolUpdateEntity } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateEntity";
import {
  convertApiEntitiesToBpEntities,
  convertApiLinkGroupsToBpLinkGroups,
  guessEntityName,
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

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { query } = router;
  const { accountId } = useRouteAccountInfo();
  const entityId = query["entity-id"] as string;

  const { data } = useQuery<GetEntityQuery, GetEntityQueryVariables>(
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

  return (
    <>
      <header>
        <h1>
          <strong>
            {entity ? `Editing '${guessEntityName(entity)}'` : "Loading..."}
          </strong>
        </h1>
      </header>
      <div>
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
            schema={entity.entityType.properties}
          />
        )}
      </div>
    </>
  );
};

Page.getLayout = getLayoutWithSidebar;

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
