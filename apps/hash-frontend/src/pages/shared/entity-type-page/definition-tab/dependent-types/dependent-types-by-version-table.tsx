import type { ParentVersionRow } from "./dependent-type-rows";
import type {
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

/** One row per version of the parent, newest first, expandable into the types that extend it. */
export const DependentTypesByVersionTable = (_props: {
  entityTypeTitle: string;
  parentVersionRows: ParentVersionRow[];
  isLinkType: (entityType: EntityTypeWithMetadata) => boolean;
  onOpenType: (entityTypeId: VersionedUrl) => void;
}) => null;
