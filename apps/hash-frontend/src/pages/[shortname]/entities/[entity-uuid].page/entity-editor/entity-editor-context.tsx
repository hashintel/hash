import { getRoots } from "@local/hash-subgraph/stdlib";
import type { PropsWithChildren } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import type { EntityEditorProps } from "../entity-editor";

export type TableExpandStatus = Record<string, boolean>;

interface Props extends EntityEditorProps {
  propertyExpandStatus: TableExpandStatus;
  togglePropertyExpand: (id: string) => void;
}

const EntityEditorContext = createContext<Props | null>(null);

export const EntityEditorContextProvider = ({
  entitySubgraph,
  setEntity,
  children,
  isDirty,
  onEntityUpdated,
  draftLinksToCreate,
  draftLinksToArchive,
  setDraftLinksToCreate,
  setDraftLinksToArchive,
  readonly,
}: PropsWithChildren<EntityEditorProps>) => {
  const [propertyExpandStatus, setPropertyExpandStatus] =
    useState<TableExpandStatus>({});

  const togglePropertyExpand = useCallback((id: string) => {
    setPropertyExpandStatus((status) => {
      return { ...status, [id]: !status[id] };
    });
  }, []);

  useMemo(() => {
    const roots = getRoots(entitySubgraph);

    if (roots.length > 1) {
      /**
       * This is an early warning system in case we accidentally start passing a subgraph with multiple roots to the entity editor.
       * If we don't throw an error, an arbitrary version of the entity will be chosen for loading into the editor,
       * which will be difficult to detect without an immediate crash.
       *
       * If this is thrown then the entitySubgraph is probably the result of a query for an entityId without a draftId,
       * where there is a live entity and one or more draft updates in the database.
       * Any query without an entityId should EXCLUDE entities with a draftId to ensure only the live version is returned.
       */
      throw new Error(
        `More than one root entity passed to entity editor, with ids: ${roots.map((root) => root.metadata.recordId.entityId).join(", ")}`,
      );
    }
  }, [entitySubgraph]);

  const state = useMemo(
    () => ({
      entitySubgraph,
      setEntity,
      isDirty,
      propertyExpandStatus,
      togglePropertyExpand,
      draftLinksToCreate,
      setDraftLinksToCreate,
      draftLinksToArchive,
      setDraftLinksToArchive,
      onEntityUpdated,
      readonly,
    }),
    [
      entitySubgraph,
      setEntity,
      isDirty,
      propertyExpandStatus,
      togglePropertyExpand,
      draftLinksToCreate,
      setDraftLinksToCreate,
      draftLinksToArchive,
      setDraftLinksToArchive,
      onEntityUpdated,
      readonly,
    ],
  );

  return (
    <EntityEditorContext.Provider value={state}>
      {children}
    </EntityEditorContext.Provider>
  );
};

export const useEntityEditor = () => {
  const state = useContext(EntityEditorContext);

  if (state === null) {
    throw new Error("no value has been provided to EntityEditorContext");
  }

  return state;
};
