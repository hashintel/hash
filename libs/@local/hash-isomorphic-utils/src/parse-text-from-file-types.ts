import type { ActorId } from "@blockprotocol/type-system";
import type { SerializedEntity } from "@local/hash-graph-sdk/entity";

import type { FileProperties } from "./system-types/shared.js";

export type ParseTextFromFileParams = {
  presignedFileDownloadUrl: string;
  fileEntity: SerializedEntity<FileProperties>;
  webMachineActorId: ActorId;
};
