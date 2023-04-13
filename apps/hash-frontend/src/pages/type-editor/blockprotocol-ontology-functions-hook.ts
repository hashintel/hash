/**
 * This file contains the Block Protocol callbacks that HASH provides to blocks
 * using the GraphQL API.
 *
 * The intention is that the contents of this file will replace the existing set
 * of functions provided to blocks, but for now the added operations are mostly
 * relevant for the type editors.
 */
import { GraphEmbedderMessageCallbacks } from "@blockprotocol/graph/temporal";
import { OwnedById } from "@local/hash-subgraph";

import {
  KnowledgeCallbacks,
  UploadFileRequestCallback,
} from "../../components/hooks/block-protocol-functions/knowledge/knowledge-shim";
import { useBlockProtocolArchiveEntity } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-archive-entity";
import { useBlockProtocolCreateEntity } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { useBlockProtocolFileUpload } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-file-upload";
// Knowledge Graph Operations
import { useBlockProtocolGetEntity } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-get-entity";
import { useBlockProtocolQueryEntities } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-query-entities";
import { useBlockProtocolUpdateEntity } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { OntologyCallbacks } from "../../components/hooks/block-protocol-functions/ontology/ontology-types-shim";
import { useBlockProtocolCreateEntityType } from "../../components/hooks/block-protocol-functions/ontology/use-block-protocol-create-entity-type";
import { useBlockProtocolCreatePropertyType } from "../../components/hooks/block-protocol-functions/ontology/use-block-protocol-create-property-type";
import { useBlockProtocolGetDataType } from "../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-data-type";
import { useBlockProtocolGetEntityType } from "../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";
import { useBlockProtocolGetPropertyType } from "../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-property-type";
// Ontology operations
import { useBlockProtocolQueryDataTypes } from "../../components/hooks/block-protocol-functions/ontology/use-block-protocol-query-data-types";
import { useBlockProtocolQueryEntityTypes } from "../../components/hooks/block-protocol-functions/ontology/use-block-protocol-query-entity-types";
import { useBlockProtocolQueryPropertyTypes } from "../../components/hooks/block-protocol-functions/ontology/use-block-protocol-query-property-types";
import { useBlockProtocolUpdateEntityType } from "../../components/hooks/block-protocol-functions/ontology/use-block-protocol-update-entity-type";
import { useBlockProtocolUpdatePropertyType } from "../../components/hooks/block-protocol-functions/ontology/use-block-protocol-update-property-type";
import { useIsReadonlyModeForApp } from "../../shared/readonly-mode";

export type GraphMessageCallbacks = Omit<
  GraphEmbedderMessageCallbacks,
  | "getLinkedAggregation"
  | "deleteEntity"
  | "deleteEntityType"
  | "createLinkedAggregation"
  | "updateLinkedAggregation"
  | "deleteLinkedAggregation"
  /** @todo-0.3 fix these inconsistencies */
  | "getEntity"
  | "createEntity"
  | "queryEntities"
  | "getEntityType"
  | "createEntityType"
  | "updateEntityType"
  | "queryEntityTypes"
  | "queryPropertyTypes"
  | "getPropertyType"
  | "uploadFile"
  | "updateEntity"
  | "getDataType"
  | "queryDataTypes"
> &
  OntologyCallbacks &
  KnowledgeCallbacks & { uploadFile: UploadFileRequestCallback };

/** @todo Consider if we should move this out of the page and into the hooks directory. */
export const useBlockProtocolFunctionsWithOntology = (
  ownedById: OwnedById | null,
): GraphMessageCallbacks => {
  const isReadonlyMode = useIsReadonlyModeForApp();

  const { queryEntities } = useBlockProtocolQueryEntities();
  const { createEntity } = useBlockProtocolCreateEntity(
    ownedById,
    isReadonlyMode,
  );

  const { getEntity } = useBlockProtocolGetEntity();
  const { updateEntity } = useBlockProtocolUpdateEntity();
  const { archiveEntity } = useBlockProtocolArchiveEntity();

  const { uploadFile } = useBlockProtocolFileUpload(isReadonlyMode);

  // Ontology operations

  const { queryDataTypes } = useBlockProtocolQueryDataTypes();
  const { getDataType } = useBlockProtocolGetDataType();
  const { createPropertyType } = useBlockProtocolCreatePropertyType(
    ownedById,
    isReadonlyMode,
  );
  const { queryPropertyTypes } = useBlockProtocolQueryPropertyTypes();
  const { getPropertyType } = useBlockProtocolGetPropertyType();
  const { updatePropertyType } =
    useBlockProtocolUpdatePropertyType(isReadonlyMode);
  const { createEntityType } = useBlockProtocolCreateEntityType(
    ownedById,
    isReadonlyMode,
  );
  const { queryEntityTypes } = useBlockProtocolQueryEntityTypes();
  const { getEntityType } = useBlockProtocolGetEntityType();
  const { updateEntityType } = useBlockProtocolUpdateEntityType(isReadonlyMode);

  return {
    queryEntities,
    createEntity,
    uploadFile,
    // Knowledge operations
    getEntity,
    updateEntity,
    archiveEntity,
    // Ontology operations
    queryDataTypes,
    getDataType,
    createPropertyType,
    queryPropertyTypes,
    getPropertyType,
    updatePropertyType,
    createEntityType,
    queryEntityTypes,
    getEntityType,
    updateEntityType,
  };
};
