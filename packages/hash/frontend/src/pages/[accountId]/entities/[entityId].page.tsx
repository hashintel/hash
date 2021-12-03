import { VoidFunctionComponent } from "react";
import { useQuery } from "@apollo/client";

import { useRouter } from "next/router";

import { BlockProtocolUpdateFn } from "@hashintel/block-protocol";
import { getEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { EntityEditor } from "../../../components/EntityEditor/EntityEditor";

import {
  GetEntityQuery,
  GetEntityQueryVariables,
  UnknownEntity,
} from "../../../graphql/apiTypes.gen";
import { useBlockProtocolUpdate } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdate";
import { entityName } from "../../../lib/entities";
import { useBlockProtocolAggregate } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolAggregate";
import { useBlockProtocolDeleteLink } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolDeleteLink";
import { useBlockProtocolCreateLink } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolCreateLink";
import { MainContentWrapper } from "../../../components/pages/MainContentWrapper";

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
  const { createLink } = useBlockProtocolCreateLink(accountId);
  const { deleteLink } = useBlockProtocolDeleteLink(accountId);
  const { update } = useBlockProtocolUpdate(accountId);
  const { aggregate } = useBlockProtocolAggregate(accountId);

  const updateAndNavigateToFirstEntity: BlockProtocolUpdateFn = (args) => {
    return update(args)
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
            aggregate={aggregate}
            createLink={createLink}
            deleteLink={deleteLink}
            update={updateAndNavigateToFirstEntity}
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
