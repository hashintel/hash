import type { SerializedEntity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";

import type { FileProperties } from "./system-types/shared.js";

export type ParseTextFromFileParams = {
  presignedFileDownloadUrl: string;
  fileEntity: SerializedEntity<FileProperties>;
  webMachineActorId: AccountId;
};
