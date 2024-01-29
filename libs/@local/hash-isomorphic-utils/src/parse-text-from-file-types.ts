import { AccountId, Entity } from "@local/hash-subgraph";

import { FileV2Properties } from "./system-types/shared";

export type ParseTextFromFileParams = {
  presignedFileDownloadUrl: string;
  fileEntity: Entity<FileV2Properties>;
  webMachineActorId: AccountId;
};
