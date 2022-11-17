/**
 * This file contains the Block Protocol callbacks that HASH provides to blocks
 * using the GraphQL API.
 *
 * The intention is that the contents of this file will replace the existing set
 * of functions provided to blocks, but for now the added operations are mostly
 * relevant for the type editors.
 */
import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";
import { OntologyCallbacks } from "../../components/hooks/blockProtocolFunctions/ontology/ontology-types-shim";
import { KnowledgeCallbacks } from "../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";

import { useBlockProtocolCreateLink } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolCreateLink";
import { useBlockProtocolCreateLinkedAggregation } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolCreateLinkedAggregation";
import { useBlockProtocolDeleteLink } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolDeleteLink";
import { useBlockProtocolDeleteLinkedAggregation } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolDeleteLinkedAggregation";
import { useBlockProtocolFileUpload } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolFileUpload";
import { useBlockProtocolUpdateLink } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateLink";
import { useBlockProtocolUpdateLinkedAggregation } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateLinkedAggregation";

import { useReadonlyMode } from "../../shared/readonly-mode";

// Ontology operations
import { useBlockProtocolAggregateDataTypes } from "../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregateDataTypes";
import { useBlockProtocolGetDataType } from "../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetDataType";

import { useBlockProtocolCreatePropertyType } from "../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolCreatePropertyType";
import { useBlockProtocolAggregatePropertyTypes } from "../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregatePropertyTypes";
import { useBlockProtocolGetPropertyType } from "../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetPropertyType";
import { useBlockProtocolUpdatePropertyType } from "../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolUpdatePropertyType";

import { useBlockProtocolCreateEntityType } from "../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolCreateEntityType";
import { useBlockProtocolAggregateEntityTypes } from "../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregateEntityTypes";
import { useBlockProtocolGetEntityType } from "../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetEntityType";
import { useBlockProtocolUpdateEntityType } from "../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolUpdateEntityType";

// Knowledge Graph Operations
import { useBlockProtocolGetEntity } from "../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolGetEntity";
import { useBlockProtocolAggregateEntities } from "../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolAggregateEntities";
import { useBlockProtocolCreateEntity } from "../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolCreateEntity";
import { useBlockProtocolUpdateEntity } from "../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolUpdateEntity";

export type GraphMessageCallbacks = Omit<
  EmbedderGraphMessageCallbacks,
  | "getEntity"
  | "aggregateEntities"
  | "updateEntity"
  | "getEntityType"
  | "getLink"
  | "getLinkedAggregation"
  | "deleteEntity"
  | "deleteEntityType"
  // Replaced by new ontology callbacks
  | "createEntityType"
  | "updateEntityType"
  | "aggregateEntityTypes"
> &
  OntologyCallbacks &
  KnowledgeCallbacks;

/** @todo Consider if we should move this out of the page and into the hooks directory. */
export const useBlockProtocolFunctionsWithOntology = (
  ownedById: string,
): GraphMessageCallbacks => {
  const { readonlyMode } = useReadonlyMode();

  const { aggregateEntities } = useBlockProtocolAggregateEntities();
  const { createLinkedAggregation } =
    useBlockProtocolCreateLinkedAggregation(readonlyMode);
  const { createLink } = useBlockProtocolCreateLink(readonlyMode);
  const { createEntity } = useBlockProtocolCreateEntity(readonlyMode);

  const { getEntity } = useBlockProtocolGetEntity();
  const { updateEntity } = useBlockProtocolUpdateEntity();

  const { deleteLinkedAggregation } =
    useBlockProtocolDeleteLinkedAggregation(readonlyMode);
  const { deleteLink } = useBlockProtocolDeleteLink(readonlyMode);
  const { uploadFile } = useBlockProtocolFileUpload(ownedById, readonlyMode);
  const { updateLinkedAggregation } =
    useBlockProtocolUpdateLinkedAggregation(readonlyMode);

  // Ontology operations

  const { aggregateDataTypes } = useBlockProtocolAggregateDataTypes();
  const { getDataType } = useBlockProtocolGetDataType();
  const { createPropertyType } = useBlockProtocolCreatePropertyType(
    ownedById,
    readonlyMode,
  );
  const { aggregatePropertyTypes } = useBlockProtocolAggregatePropertyTypes();
  const { getPropertyType } = useBlockProtocolGetPropertyType();
  const { updatePropertyType } =
    useBlockProtocolUpdatePropertyType(readonlyMode);
  const { createEntityType } = useBlockProtocolCreateEntityType(
    ownedById,
    readonlyMode,
  );
  const { aggregateEntityTypes } = useBlockProtocolAggregateEntityTypes();
  const { getEntityType } = useBlockProtocolGetEntityType();
  const { updateEntityType } = useBlockProtocolUpdateEntityType(readonlyMode);

  const { updateLink } = useBlockProtocolUpdateLink();

  return {
    aggregateEntities,
    createEntity,
    createLinkedAggregation,
    createLink,
    deleteLinkedAggregation,
    deleteLink,
    uploadFile,
    updateLink,
    updateLinkedAggregation,
    // Knowledge operations
    getEntity,
    updateEntity,
    // Ontology operations
    aggregateDataTypes,
    getDataType,
    createPropertyType,
    aggregatePropertyTypes,
    getPropertyType,
    updatePropertyType,
    createEntityType,
    aggregateEntityTypes,
    getEntityType,
    updateEntityType,
  };
};
