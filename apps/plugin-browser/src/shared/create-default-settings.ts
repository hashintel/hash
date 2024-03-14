import type { OwnedById } from "@local/hash-subgraph";

import { defaultProductionRules } from "../pages/popup/popup-contents/action-center/default-production-rules";
import type { PersistedUserSettings } from "./storage";

export const createDefaultSettings = ({
  userWebOwnedById,
}: {
  userWebOwnedById: OwnedById;
}): PersistedUserSettings => {
  const automaticInferenceConfig: PersistedUserSettings["automaticInferenceConfig"] =
    {
      createAs: "draft",
      displayGroupedBy: "type",
      enabled: false,
      model: "gpt-4-turbo",
      ownedById: userWebOwnedById,
      rules:
        FRONTEND_ORIGIN === "https://app.hash.ai" ? defaultProductionRules : [],
    };

  const manualInferenceConfig: PersistedUserSettings["manualInferenceConfig"] =
    {
      createAs: "draft",
      model: "gpt-4-turbo",
      ownedById: userWebOwnedById,
      targetEntityTypeIds: [],
    };

  return {
    automaticInferenceConfig,
    draftQuickNote: "",
    manualInferenceConfig,
    popupTab: "one-off",
  };
};
