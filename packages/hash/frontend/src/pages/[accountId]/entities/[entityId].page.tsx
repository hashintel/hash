import { VoidFunctionComponent } from "react";
import { useQuery } from "@apollo/client";

import { useRouter } from "next/router";

import {
  BlockProtocolAggregateFn,
  BlockProtocolUpdateFn,
} from "@hashintel/block-protocol";
import { getEntity } from "@hashintel/hash-shared/queries/entity.queries";
import styles from "../../index.module.scss";
import { PageSidebar } from "../../../components/layout/PageSidebar/PageSidebar";
import { EntityEditor } from "../../../components/EntityEditor/EntityEditor";

import {
  GetEntityQuery,
  GetEntityQueryVariables,
  UnknownEntity,
} from "../../../graphql/apiTypes.gen";
import { useBlockProtocolUpdate } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdate";
import { entityName } from "../../../lib/entities";
import { useBlockProtocolAggregate } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolAggregate";

const Entity: VoidFunctionComponent = () => {
  const router = useRouter();
  const { query } = router;
  const accountId = query.accountId as string;
  const entityId = query.entityId as string;

  const { data } = useQuery<GetEntityQuery, GetEntityQueryVariables>(
    getEntity,
    {
      variables: {
        accountId,
        entityId,
      },
    }
  );
  const { update } = useBlockProtocolUpdate();
  const { aggregate } = useBlockProtocolAggregate();

  const aggregateFn: BlockProtocolAggregateFn = (args) =>
    aggregate({
      ...args,
      accountId,
    });

  const updateFn: BlockProtocolUpdateFn = (args) => {
    for (const action of args) {
      action.accountId = accountId;
    }
    return update(args)
      .then((res) => {
        void router.push(
          `/${accountId}/entities/${(res[0] as UnknownEntity).entityId}`
        );
        return res;
      })
      .catch((err) => {
        console.error(`Error updating entity: ${err.message}`);
        throw err;
      });
  };

  const entity = data?.entity;

  return (
    <div className={styles.MainWrapper}>
      <PageSidebar />
      <main className={styles.MainContent}>
        <header>
          <h1>
            <strong>
              {entity ? `Editing ${entityName(entity)}` : "Loading..."}
            </strong>
          </h1>
        </header>
        <div>
          {entity && (
            <EntityEditor
              aggregate={aggregateFn}
              update={updateFn}
              entityProperties={entity.properties}
              entityId={entityId!}
              schema={entity.entityType.properties}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default Entity;
