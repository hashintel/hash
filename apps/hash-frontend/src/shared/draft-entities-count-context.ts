import { createContext, useContext } from "react";

export type DraftEntitiesCountContextValue = {
  count?: number;
  loading: boolean;
  refetch: () => Promise<void>;
};

export const DraftEntitiesCountContext =
  createContext<null | DraftEntitiesCountContextValue>(null);

export const useDraftEntitiesCount = () => {
  const draftEntitiesContext = useContext(DraftEntitiesCountContext);

  if (!draftEntitiesContext) {
    throw new Error("DraftEntitiesCountContext missing");
  }

  return draftEntitiesContext;
};
