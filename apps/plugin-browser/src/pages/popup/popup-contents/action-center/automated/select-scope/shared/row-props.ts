import { VersionedUrl } from "@blockprotocol/graph";

import { LocalStorage } from "../../../../../../../shared/storage";

type DraftRule = {
  entityTypeId?: VersionedUrl;
  restrictToDomains: string[];
};

export type RowProps = {
  domainOptions: string[];
  inferenceConfig: LocalStorage["automaticInferenceConfig"];
  setInferenceConfig: (
    config: LocalStorage["automaticInferenceConfig"],
  ) => void;
  // The rule for the row – may be a draft or non-draft rule
  rule: DraftRule;
  setDraftRule: (rule: DraftRule | null) => void;
};
