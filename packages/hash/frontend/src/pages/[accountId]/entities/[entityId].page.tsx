import { VoidFunctionComponent } from "react";
import { useQuery } from "@apollo/client";

import { useRouter } from "next/router";

import { BlockProtocolUpdateEntitiesFunction } from "blockprotocol";
import { getEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { EntityEditor } from "../../../components/EntityEditor/EntityEditor";

import {
  GetEntityQuery,
  GetEntityQueryVariables,
  UnknownEntity,
} from "../../../graphql/apiTypes.gen";
import { useBlockProtocolUpdateEntities } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateEntities";
import { entityName } from "../../../lib/entities";
import { useBlockProtocolAggregateEntities } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolAggregateEntities";
import { useBlockProtocolDeleteLinks } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolDeleteLinks";
import { useBlockProtocolCreateLinks } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolCreateLinks";
import { MainContentWrapper } from "../../../components/layout/MainContentWrapper";

const Entity: VoidFunctionComponent = () => {
  const router = useRouter();
  const { query } = router;
  const accountId = query.accountId as string;
  const entityId = query.entityId as string;

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
    <MainContentWrapper>
      <header>
        <h1>
          <strong>
            {entity ? `Editing '${entityName(entity)}'` : "Loading..."}
          </strong>
        </h1>
      </header>
      <div>
        {entity && (
          <EntityEditor
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
    </MainContentWrapper>
  );
};

export default Entity;
