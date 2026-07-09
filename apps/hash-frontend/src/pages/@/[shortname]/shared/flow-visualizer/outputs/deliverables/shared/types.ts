import type { VersionedUrl } from "@blockprotocol/type-system/slim";

export type DeliverableData =
  | {
      displayName?: string;
      entityTypeId: VersionedUrl;
      fileName?: string;
      fileUrl: string;
      type: "file";
    }
  | {
      displayName: string;
      markdown: string;
      type: "markdown";
    };
