import type { AccountId } from "@local/hash-graph-types/account";
import type { Entity } from "@local/hash-subgraph";

import type { FileProperties } from "./system-types/shared";

export type ParseTextFromFileParams = {
  presignedFileDownloadUrl: string;
  fileEntity: Entity<FileProperties>;
  webMachineActorId: AccountId;
};
