import { EntityId } from "@local/hash-graphql-shared/types";
import { Dispatch, SetStateAction, useState } from "react";

import { LinkAndTargetEntity } from "../entity-editor/links-section/link-table/types";

export type DraftLinksToCreate = LinkAndTargetEntity[];

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
