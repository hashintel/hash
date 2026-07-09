import type { FileProperties } from "./system-types/shared.js";
import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type { SerializedEntity } from "@local/hash-graph-sdk/entity";

export type ParseTextFromFileParams = {
  presignedFileDownloadUrl: string;
  fileEntity: SerializedEntity<FileProperties>;
  webMachineActorId: ActorEntityUuid;
};
