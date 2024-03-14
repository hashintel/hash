import type { EntityId, EntityRootType, Subgraph } from "@local/hash-subgraph";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

import type { LinkAndTargetEntity } from "../entity-editor/links-section/link-table/types";

export type DraftLinksToCreate = (LinkAndTargetEntity & {
  sourceSubgraph: Subgraph<EntityRootType> | null;
})[];

export type DraftLinksToArchive = EntityId[];

export interface DraftLinkState {
  draftLinksToCreate: DraftLinksToCreate;
  setDraftLinksToCreate: Dispatch<SetStateAction<DraftLinksToCreate>>;
  draftLinksToArchive: DraftLinksToArchive;
  setDraftLinksToArchive: Dispatch<SetStateAction<DraftLinksToArchive>>;
}

export const useDraftLinkState = () => {
  const [draftLinksToCreate, setDraftLinksToCreate] =
    useState<DraftLinksToCreate>([]);
  const [draftLinksToArchive, setDraftLinksToArchive] =
    useState<DraftLinksToArchive>([]);

  return [
    draftLinksToCreate,
    setDraftLinksToCreate,
    draftLinksToArchive,
    setDraftLinksToArchive,
  ] as const;
};
