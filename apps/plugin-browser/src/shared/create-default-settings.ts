import type { WebId } from "@blockprotocol/type-system";

import { defaultProductionRules } from "../pages/popup/popup-contents/action-center/default-production-rules";
import type { PersistedUserSettings } from "./storage";

export const createDefaultSettings = ({
  userWebWebId,
}: {
  userWebWebId: WebId;
}): PersistedUserSettings => {
  const automaticInferenceConfig: PersistedUserSettings["automaticInferenceConfig"] =
    {
      createAs: "draft",
      displayGroupedBy: "type",
      enabled: false,
      model: "gpt-4-turbo",
      webId: userWebWebId,
      rules:
        FRONTEND_ORIGIN === "https://app.hash.ai" ? defaultProductionRules : [],
    };

  const manualInferenceConfig: PersistedUserSettings["manualInferenceConfig"] =
    {
      createAs: "draft",
      model: "gpt-4-turbo",
      webId: userWebWebId,
      targetEntityTypeIds: [],
    };

  return {
    automaticInferenceConfig,
    draftQuickNote: "",
    manualInferenceConfig,
    popupTab: "one-off",
  };
};
