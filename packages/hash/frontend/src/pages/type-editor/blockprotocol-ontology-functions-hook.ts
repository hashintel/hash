import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";
import { OntologyCallbacks } from "../../components/hooks/blockProtocolFunctions/ontology/ontology-types-shim";

import { useBlockProtocolAggregateEntities } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolAggregateEntities";
import { useBlockProtocolCreateEntity } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolCreateEntity";
import { useBlockProtocolCreateLink } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolCreateLink";
import { useBlockProtocolCreateLinkedAggregation } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolCreateLinkedAggregation";
import { useBlockProtocolDeleteLink } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolDeleteLink";
import { useBlockProtocolDeleteLinkedAggregation } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolDeleteLinkedAggregation";
import { useBlockProtocolFileUpload } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolFileUpload";
import { useBlockProtocolUpdateEntity } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateEntity";
import { useBlockProtocolUpdateLink } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateLink";
import { useBlockProtocolUpdateLinkedAggregation } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateLinkedAggregation";

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

import { useBlockProtocolCreateLinkType } from "../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolCreateLinkType";
import { useBlockProtocolAggregateLinkTypes } from "../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregateLinkTypes";
import { useBlockProtocolGetLinkType } from "../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetLinkType";
import { useBlockProtocolUpdateLinkType } from "../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolUpdateLinkType";

import { useReadonlyMode } from "../../shared/readonly-mode";

export type GraphMessageCallbacks = Omit<
  EmbedderGraphMessageCallbacks,
  | "getEntity"
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
  OntologyCallbacks;

/** @todo Consider if we should move this out of the page and into the hooks directory. */
export const useBlockProtocolFunctionsWithOntology = (
  accountId: string,
): GraphMessageCallbacks => {
  const { readonlyMode } = useReadonlyMode();

  const { aggregateEntities } = useBlockProtocolAggregateEntities(accountId);
  const { createLinkedAggregation } =
    useBlockProtocolCreateLinkedAggregation(readonlyMode);
  const { createLink } = useBlockProtocolCreateLink(readonlyMode);
  const { createEntity } = useBlockProtocolCreateEntity(
    accountId,
    readonlyMode,
  );
  const { deleteLinkedAggregation } =
    useBlockProtocolDeleteLinkedAggregation(readonlyMode);
  const { deleteLink } = useBlockProtocolDeleteLink(readonlyMode);
  const { updateEntity } = useBlockProtocolUpdateEntity(false, readonlyMode);
  const { uploadFile } = useBlockProtocolFileUpload(accountId, readonlyMode);
  const { updateLinkedAggregation } =
    useBlockProtocolUpdateLinkedAggregation(readonlyMode);

  // Ontology operations

  const { aggregateDataTypes } = useBlockProtocolAggregateDataTypes();
  const { getDataType } = useBlockProtocolGetDataType();
  const { createPropertyType } = useBlockProtocolCreatePropertyType(
    accountId,
    readonlyMode,
  );
  const { aggregatePropertyTypes } = useBlockProtocolAggregatePropertyTypes();
  const { getPropertyType } = useBlockProtocolGetPropertyType();
  const { updatePropertyType } = useBlockProtocolUpdatePropertyType(
    accountId,
    readonlyMode,
  );
  const { createEntityType } = useBlockProtocolCreateEntityType(
    accountId,
    readonlyMode,
  );
  const { aggregateEntityTypes } = useBlockProtocolAggregateEntityTypes();
  const { getEntityType } = useBlockProtocolGetEntityType();
  const { updateEntityType } = useBlockProtocolUpdateEntityType(
    accountId,
    readonlyMode,
  );
  const { createLinkType } = useBlockProtocolCreateLinkType(
    accountId,
    readonlyMode,
  );
  const { aggregateLinkTypes } = useBlockProtocolAggregateLinkTypes();
  const { getLinkType } = useBlockProtocolGetLinkType();
  const { updateLinkType } = useBlockProtocolUpdateLinkType(
    accountId,
    readonlyMode,
  );

  const { updateLink } = useBlockProtocolUpdateLink();

  return {
    aggregateEntities,
    createEntity,
    createLinkedAggregation,
    createLink,
    deleteLinkedAggregation,
    deleteLink,
    updateEntity,
    uploadFile,
    updateLink,
    updateLinkedAggregation,
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
    createLinkType,
    aggregateLinkTypes,
    getLinkType,
    updateLinkType,
  };
};
