import { AccountId, Entity } from "@local/hash-subgraph";

import { FileProperties } from "./system-types/shared";

export type ParseTextFromFileParams = {
  presignedFileDownloadUrl: string;
  fileEntity: Entity<FileProperties>;
  webMachineActorId: AccountId;
};
