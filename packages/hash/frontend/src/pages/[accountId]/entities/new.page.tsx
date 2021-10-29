import { useEffect, useMemo, useState, VoidFunctionComponent } from "react";
import { useQuery } from "@apollo/client";
import { tw } from "twind";

import { useRouter } from "next/router";

import {
  BlockProtocolCreateFn,
  BlockProtocolAggregateFn,
} from "@hashintel/block-protocol";
import styles from "../../index.module.scss";
import { PageSidebar } from "../../../components/layout/PageSidebar/PageSidebar";
import { EntityEditor } from "../../../components/EntityEditor/EntityEditor";

import { getAccountEntityTypes } from "../../../graphql/queries/account.queries";
import {
  GetAccountEntityTypesQuery,
  GetAccountEntityTypesQueryVariables,
  UnknownEntity,
} from "../../../graphql/apiTypes.gen";
import { useBlockProtocolCreate } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolCreate";
import { useBlockProtocolAggregate } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolAggregate";

const NewEntity: VoidFunctionComponent = () => {
  const router = useRouter();
  const { query } = router;
  const accountId = query.accountId as string;
  const entityTypeId = query.entityTypeId as string | undefined;

  const [selectedTypeId, setSelectedTypeId] = useState<string | undefined>(
    entityTypeId
  );

  const { create } = useBlockProtocolCreate();
  const { aggregate } = useBlockProtocolAggregate();

  const aggregateFn: BlockProtocolAggregateFn = (args) =>
    aggregate({
      ...args,
      accountId,
    });

  const createFn: BlockProtocolCreateFn = (args) => {
    for (const action of args) {
      action.accountId = accountId;
    }
    return create(args)
      .then((res) => {
        void router.push(
          `/${accountId}/entities/${(res[0] as UnknownEntity).entityId}`
        );
        return res;
      })
      .catch((err) => {
        console.error(`Error creating entity: ${err.message}`);
        throw err;
      });
  };

  useEffect(() => {
    if (
      typeof router.query.entityTypeId === "string" &&
      selectedTypeId !== router.query.entityTypeId
    ) {
      setSelectedTypeId(router.query.entityTypeId);
    }
  }, [router.query.entityTypeId, selectedTypeId]);

  const { data } = useQuery<
    GetAccountEntityTypesQuery,
    GetAccountEntityTypesQueryVariables
  >(getAccountEntityTypes, {
    variables: {
      accountId,
      includeOtherTypesInUse: true,
    },
  });

  const typeOptions = data?.getAccountEntityTypes;
  const selectedType = useMemo(() => {
    return (typeOptions ?? []).find(
      (option) => option.entityId === selectedTypeId
    );
  }, [selectedTypeId, typeOptions]);

  return (
    <div className={styles.MainWrapper}>
      <PageSidebar />
      <main className={styles.MainContent}>
        <header>
          <h1>Create an entity</h1>
        </header>
        <div className={tw`mb-12`}>
          <select
            className={tw`py-2 px-4 rounded-md border border-gray-300 w-40 text-sm`}
            onChange={(evt) =>
              router.push(
                `/${accountId}/entities/new?entityTypeId=${evt.target.value}`
              )
            }
            value={selectedTypeId ?? "none"}
          >
            {/* eslint-disable-next-line jsx-a11y/control-has-associated-label */}
            <option disabled value="none" />
            {(typeOptions ?? []).map((type) => (
              <option key={type.entityId} value={type.entityId}>
                {type.properties.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          {selectedType && (
            <EntityEditor
              aggregate={aggregateFn}
              create={createFn}
              entityTypeId={selectedTypeId!}
              schema={selectedType.properties}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default NewEntity;
