import { EntityType } from "@blockprotocol/graph";
import { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import { User } from "@local/hash-isomorphic-utils/system-types/shared";
import { useState } from "react";
import { v4 as uuid } from "uuid";
import { Tabs } from "webextension-polyfill";

import { Action } from "./action";
import { CreateEntityIcon } from "./infer-entities-action/create-entity-icon";
import { CreateInferredEntities } from "./infer-entities-action/create-inferred-entities";
import { SelectTypesAndInfer } from "./infer-entities-action/select-types-and-infer";

export const InferEntitiesAction = ({
  activeTab,
  user,
}: {
  activeTab?: Tabs.Tab | null;
  user: Simplified<User>;
}) => {
  const [inferredEntities, setInferredEntities] = useState<ProposedEntity[]>(
    [],
  );
  const [targetEntityTypes, setTargetEntityTypes] = useState<EntityType[]>([]);

  return (
    <Action
      HeaderIcon={CreateEntityIcon}
      headerText="Create entities from page"
      linkHref="https://app.hash.ai/entities"
      linkText="View entities"
    >
      {inferredEntities.length > 0 ? (
        <CreateInferredEntities
          reset={() => setInferredEntities([])}
          inferredEntities={inferredEntities}
          targetEntityTypes={targetEntityTypes}
          user={user}
        />
      ) : (
        <SelectTypesAndInfer
          activeTab={activeTab}
          setInferredEntities={(entities) =>
            setInferredEntities(
              entities.map((entity) => ({
                ...entity,
                tempUuid: uuid(),
              })),
            )
          }
          setTargetEntityTypes={setTargetEntityTypes}
          targetEntityTypes={targetEntityTypes}
        />
      )}
    </Action>
  );
};
