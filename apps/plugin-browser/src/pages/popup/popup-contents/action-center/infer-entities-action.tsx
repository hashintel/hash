import { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import { User } from "@local/hash-isomorphic-utils/system-types/shared";
import { Tabs } from "webextension-polyfill";

import { clearBadge } from "../../../../shared/badge";
import { useSessionStorage } from "../../../shared/use-storage-sync";
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
  const [inferenceStatus, setInferenceStatus] = useSessionStorage(
    "inferenceStatus",
    { status: "not-started" },
  );
  const [targetEntityTypes, setTargetEntityTypes] = useSessionStorage(
    "targetEntityTypes",
    [],
  );

  const reset = () => {
    setInferenceStatus({ status: "not-started" });
    clearBadge();
  };

  return (
    <Action
      HeaderIcon={CreateEntityIcon}
      headerText="Create entities from page"
      linkHref="https://app.hash.ai/entities"
      linkText="View entities"
    >
      {inferenceStatus.status === "success" ? (
        <CreateInferredEntities
          reset={reset}
          inferredEntities={inferenceStatus.proposedEntities}
          targetEntityTypes={targetEntityTypes}
          user={user}
        />
      ) : (
        <SelectTypesAndInfer
          activeTab={activeTab}
          inferenceStatus={inferenceStatus}
          resetInferenceStatus={reset}
          setTargetEntityTypes={setTargetEntityTypes}
          targetEntityTypes={targetEntityTypes}
        />
      )}
    </Action>
  );
};
