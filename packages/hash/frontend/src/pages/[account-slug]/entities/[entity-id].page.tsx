import { useQuery } from "@apollo/client";
import { useRouter } from "next/router";

import { BlockProtocolUpdateEntitiesFunction } from "blockprotocol";
import { getEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { SimpleEntityEditor } from "./shared/simple-entity-editor";

import {
  GetEntityQuery,
  GetEntityQueryVariables,
  UnknownEntity,
} from "../../../graphql/apiTypes.gen";
import { useBlockProtocolUpdateEntities } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateEntities";
import { guessEntityName } from "../../../lib/entities";
import { useBlockProtocolAggregateEntities } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolAggregateEntities";
import { useBlockProtocolDeleteLinks } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolDeleteLinks";
import { useBlockProtocolCreateLinks } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolCreateLinks";
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

  const { data, refetch: refetchEntity } = useQuery<
    GetEntityQuery,
    GetEntityQueryVariables
  >(getEntity, {
    variables: {
      accountId,
      entityId,
    },
  });
  const { createLinks } = useBlockProtocolCreateLinks();
  const { deleteLinks } = useBlockProtocolDeleteLinks();
  const { updateEntities } = useBlockProtocolUpdateEntities();
  const { aggregateEntities } = useBlockProtocolAggregateEntities();

  const updateAndNavigateToFirstEntity: BlockProtocolUpdateEntitiesFunction = (
    args,
  ) => {
    return updateEntities(args)
      .then((res) => {
        void router.push(
          `/${accountId}/entities/${(res[0] as UnknownEntity).entityId}`,
        );
        return res;
      })
      .catch((err) => {
        // eslint-disable-next-line no-console -- TODO: consider using logger
        console.error(`Error updating entity: ${err.message}`);
        throw err;
      });
  };

  const entity = data?.entity;

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
            createLinks={createLinks}
            deleteLinks={deleteLinks}
            updateEntities={updateAndNavigateToFirstEntity}
            entityProperties={entity.properties}
            schema={entity.entityType.properties}
            refetchEntity={refetchEntity}
            {...entity}
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
