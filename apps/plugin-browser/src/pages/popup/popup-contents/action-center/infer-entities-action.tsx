import { Tabs } from "webextension-polyfill";

import { useLocalStorage } from "../../../shared/use-storage-sync";
import { Action } from "./action";
import { CreateEntityIcon } from "./infer-entities-action/create-entity-icon";
import { InferenceRequests } from "./infer-entities-action/inference-requests";
import { SelectTypesAndInfer } from "./infer-entities-action/select-types-and-infer";

export const InferEntitiesAction = ({
  activeTab,
}: {
  activeTab?: Tabs.Tab | null;
}) => {
  const [targetEntityTypes, setTargetEntityTypes] = useLocalStorage(
    "targetEntityTypes",
    [],
  );

  return (
    <Action
      HeaderIcon={CreateEntityIcon}
      headerText="Create entities from page"
      linkHref="https://app.hash.ai/entities"
      linkText="View entities"
    >
      <SelectTypesAndInfer
        activeTab={activeTab}
        setTargetEntityTypes={setTargetEntityTypes}
        targetEntityTypes={targetEntityTypes}
      />
      <InferenceRequests />
    </Action>
  );
};
