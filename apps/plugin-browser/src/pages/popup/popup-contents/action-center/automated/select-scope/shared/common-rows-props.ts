import type { VersionedUrl } from "@blockprotocol/type-system/slim";

import type { LocalStorage } from "../../../../../../../shared/storage";

type DraftRule = {
  entityTypeId?: VersionedUrl;
  restrictToDomains: string[];
};

export type CommonRowsProps = {
  domainOptions: string[];
  inferenceConfig: LocalStorage["automaticInferenceConfig"];
  setInferenceConfig: (
    config: LocalStorage["automaticInferenceConfig"],
  ) => void;
  draftRule?: DraftRule | null;
  setDraftRule: (rule: DraftRule | null) => void;
};
