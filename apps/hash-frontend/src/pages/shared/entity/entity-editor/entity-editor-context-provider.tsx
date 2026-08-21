import { useCallback, useEffect, useMemo, useState } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";

import { EntityEditorContext } from "./entity-editor-context";

import type { EntityEditorProps } from "../entity-editor";
import type { TableExpandStatus } from "./entity-editor-context";
import type { PropsWithChildren } from "react";

export const EntityEditorContextProvider = ({
  children,
  closedMultiEntityType,
  closedMultiEntityTypesDefinitions,
  customEntityLinksColumns,
  defaultOutgoingLinkFilters,
  draftLinksToArchive,
  draftLinksToCreate,
  entityLabel,
  entitySubgraph,
  isDirty,
  linkAndDestinationEntitiesClosedMultiEntityTypesMap,
  onEntityClick,
  onEntityUpdated,
  onTypeClick,
  readonly,
  setDraftLinksToArchive,
  setDraftLinksToCreate,
  setEntity,
  handleTypesChange,
  slideContainerRef,
  validationReport,
}: PropsWithChildren<EntityEditorProps>) => {
  const [propertyExpandStatus, setPropertyExpandStatus] =
    useState<TableExpandStatus>({});

  useEffect(() => {
    const propertyObjectsWithErrorsInChildren = validationReport?.errors
      .map(({ propertyPath, type }) =>
        type === "child-has-errors" ? propertyPath : undefined,
      )
      .filter((path) => !!path);

    if (propertyObjectsWithErrorsInChildren?.length) {
      setPropertyExpandStatus((currentStatus) => {
        return propertyObjectsWithErrorsInChildren.reduce(
          (status, path) => {
            const key = path.join(".");
            return { ...status, [key]: true };
          },
          { ...currentStatus },
        );
      });
    }
  }, [validationReport]);

  const togglePropertyExpand = useCallback((id: string) => {
    setPropertyExpandStatus((status) => {
      return { ...status, [id]: !status[id] };
    });
  }, []);

  const entity = useMemo(() => {
    const roots = getRoots(entitySubgraph);

    const foundEntity = roots[0];

    if (roots.length > 1) {
      /**
       * This is an early warning system in case we accidentally start passing a subgraph with multiple roots to the
       * entity editor. If we don't throw an error, an arbitrary version of the entity will be chosen for loading into
       * the editor, which will be difficult to detect without an immediate crash.
       *
       * If this is thrown then the entitySubgraph is probably the result of a query for an entityId without a draftId,
       * where there is a live entity and one or more draft updates in the database.
       * Any query without an entityId should EXCLUDE entities with a draftId to ensure only the live version is
       * returned.
       */
      throw new Error(
        `More than one root entity passed to entity editor, with ids: ${roots
          .map((root) => root.metadata.recordId.entityId)
          .join(", ")}`,
      );
    }

    if (!foundEntity) {
      throw new Error("No root entity found in entity editor subgraph");
    }

    return foundEntity;
  }, [entitySubgraph]);

  const state = useMemo(
    () => ({
      closedMultiEntityType,
      closedMultiEntityTypesDefinitions,
      customEntityLinksColumns,
      defaultOutgoingLinkFilters,
      draftLinksToArchive,
      draftLinksToCreate,
      entity,
      entityLabel,
      entitySubgraph,
      handleTypesChange,
      isDirty,
      isLocalDraftOnly:
        extractEntityUuidFromEntityId(entity.metadata.recordId.entityId) ===
        "draft",
      linkAndDestinationEntitiesClosedMultiEntityTypesMap,
      onEntityClick,
      onEntityUpdated,
      onTypeClick,
      propertyExpandStatus,
      readonly,
      setDraftLinksToArchive,
      setDraftLinksToCreate,
      setEntity,
      slideContainerRef,
      togglePropertyExpand,
      validationReport,
    }),
    [
      closedMultiEntityType,
      closedMultiEntityTypesDefinitions,
      customEntityLinksColumns,
      defaultOutgoingLinkFilters,
      draftLinksToArchive,
      draftLinksToCreate,
      entity,
      entityLabel,
      entitySubgraph,
      handleTypesChange,
      isDirty,
      linkAndDestinationEntitiesClosedMultiEntityTypesMap,
      onEntityClick,
      onEntityUpdated,
      onTypeClick,
      propertyExpandStatus,
      readonly,
      setDraftLinksToArchive,
      setDraftLinksToCreate,
      setEntity,
      slideContainerRef,
      togglePropertyExpand,
      validationReport,
    ],
  );

  return (
    <EntityEditorContext.Provider value={state}>
      {children}
    </EntityEditorContext.Provider>
  );
};
