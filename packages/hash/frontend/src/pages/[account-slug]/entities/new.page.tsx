import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";

import { useEffect, useMemo, useState } from "react";
import { tw } from "twind";

import { useRouter } from "next/router";

import { SimpleEntityEditor } from "./shared/simple-entity-editor";

import { useBlockProtocolCreateEntity } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolCreateEntity";
import { useBlockProtocolAggregateEntities } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolAggregateEntities";
import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../shared/layout";
import { useAccountEntityTypes } from "../../../components/hooks/useAccountEntityTypes";
import { useRouteAccountInfo } from "../../../shared/routing";
import { parseEntityIdentifier } from "../../../lib/entities";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { query } = router;
  const { accountId } = useRouteAccountInfo();
  const entityTypeId = query.entityTypeId as string | undefined;

  const [selectedTypeId, setSelectedTypeId] = useState<string | undefined>(
    entityTypeId,
  );

  const { createEntity } = useBlockProtocolCreateEntity(accountId);
  const { aggregateEntities } = useBlockProtocolAggregateEntities(accountId);

  const createAndNavigateToFirstEntity: EmbedderGraphMessageCallbacks["createEntity"] =
    (args) => {
      return createEntity(args)
        .then(({ data }) => {
          if (!data) {
            throw new Error("No data returned from createEntity call");
          }
          const {
            accountId: createdEntityAccountId,
            entityId: createdEntityEntityId,
          } = parseEntityIdentifier(data.entityId);
          void router.push(
            `/${createdEntityAccountId}/entities/${createdEntityEntityId}`,
          );
          return { data };
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
    <>
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
            aggregateEntities={aggregateEntities}
            createEntity={createAndNavigateToFirstEntity}
            entityTypeId={selectedTypeId!}
            schema={selectedType.properties}
          />
        )}
      </div>
    </>
  );
};

Page.getLayout = getLayoutWithSidebar;

export default Page;
