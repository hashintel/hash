import type { AccountId } from "@local/hash-graph-types/account";
import type { SimpleEntity } from "@local/hash-graph-types/entity";

import type { FileProperties } from "./system-types/shared";

export type ParseTextFromFileParams = {
  presignedFileDownloadUrl: string;
  fileEntity: SimpleEntity<FileProperties>;
  webMachineActorId: AccountId;
};
