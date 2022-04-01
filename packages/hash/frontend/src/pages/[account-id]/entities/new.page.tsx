import { useEffect, useMemo, useState } from "react";
import { tw } from "twind";

import { useRouter } from "next/router";

import { BlockProtocolCreateEntitiesFunction } from "blockprotocol";
import { NextPage } from "next";
import { SimpleEntityEditor } from "./shared/simple-entity-editor";

import { UnknownEntity } from "../../../graphql/apiTypes.gen";
import { useBlockProtocolCreateEntities } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolCreateEntitities";
import { useBlockProtocolAggregateEntities } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolAggregateEntities";
import { MainContentWrapper } from "../../../components/layout/MainContentWrapper";
import { useAccountEntityTypes } from "../../../components/hooks/useAccountEntityTypes";

const NewEntityPage: NextPage = () => {
  const router = useRouter();
  const { query } = router;
  const accountId = query["account-id"] as string;
  const entityTypeId = query.entityTypeId as string | undefined;

  const [selectedTypeId, setSelectedTypeId] = useState<string | undefined>(
    entityTypeId,
  );

  const { createEntities } = useBlockProtocolCreateEntities();
  const { aggregateEntities } = useBlockProtocolAggregateEntities();

  const createAndNavigateToFirstEntity: BlockProtocolCreateEntitiesFunction = (
    args,
  ) => {
    return createEntities(args)
      .then((res) => {
        void router.push(
          `/${accountId}/entities/${(res[0] as UnknownEntity).entityId}`,
        );
        return res;
      })
      .catch((err) => {
        // eslint-disable-next-line no-console -- TODO: consider using logger
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

  const { data } = useAccountEntityTypes(accountId, true);

  const typeOptions = data?.getAccountEntityTypes;
  const selectedType = useMemo(() => {
    return (typeOptions ?? []).find(
      (option) => option.entityId === selectedTypeId,
    );
  }, [selectedTypeId, typeOptions]);

  return (
    <MainContentWrapper>
      <header>
        <h1>Create an entity</h1>
      </header>
      <div className={tw`mb-12`}>
        <select
          className={tw`py-2 px-4 rounded-md border border-gray-300 w-40 text-sm`}
          onChange={(evt) =>
            router.push(
              `/${accountId}/entities/new?entityTypeId=${evt.target.value}`,
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
          <SimpleEntityEditor
            accountId={accountId}
            aggregateEntities={aggregateEntities}
            createEntities={createAndNavigateToFirstEntity}
            entityTypeId={selectedTypeId!}
            schema={selectedType.properties}
          />
        )}
      </div>
    </MainContentWrapper>
  );
};

export default NewEntityPage;
