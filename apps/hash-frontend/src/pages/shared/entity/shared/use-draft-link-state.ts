import type { EntityId } from "@blockprotocol/type-system";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

import type { LinkAndTargetEntity } from "../entity-editor/links-section/outgoing-links-section/types";

export type DraftLinksToCreate = (LinkAndTargetEntity & {
  rightEntityLabel: string;
  linkEntityLabel: string;
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
