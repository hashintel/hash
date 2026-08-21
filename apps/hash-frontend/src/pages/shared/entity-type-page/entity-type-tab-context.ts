import { createContext, useContext } from "react";

import { generateLinkParameters } from "../../../shared/generate-link-parameters";

import type { VersionedUrl } from "@blockprotocol/type-system";

export const defaultTab = "definition";

export type EntityTypeTab = "definition" | "entities" | "upload" | "create";

interface EntityTypeTabContextValue {
  tab: EntityTypeTab;
  setTab: (tab: EntityTypeTab) => void;
}

export const EntityTypeTabContext =
  createContext<EntityTypeTabContextValue | null>(null);

export const useEntityTypeTab = () => {
  const context = useContext(EntityTypeTabContext);
  if (!context) {
    throw new Error(
      "useEntityTypeTab must be used within an EntityTypeTabProvider",
    );
  }
  return context;
};

export const getTabUrl = (tab: string, entityTypeId: VersionedUrl) => {
  const pathWithoutParams = generateLinkParameters(entityTypeId).href;

  return tab === defaultTab
    ? pathWithoutParams
    : `${pathWithoutParams}?tab=${encodeURIComponent(tab)}`;
};
