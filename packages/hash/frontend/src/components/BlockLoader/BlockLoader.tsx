import { UnknownRecord } from "@blockprotocol/core";
import {
  Entity as BpEntity,
  BlockGraphProperties,
  EntityType as BpEntityType,
  LinkedAggregation as BpLinkedAggregation,
} from "@blockprotocol/graph";
import { HashBlock } from "@hashintel/hash-shared/blocks";
import {
  BlockEntity,
  isTextContainingEntityProperties,
  isTextProperties,
} from "@hashintel/hash-shared/entity";
import { childrenForTextEntity } from "@hashintel/hash-shared/text";
import { Fragment, Schema } from "prosemirror-model";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  FunctionComponent,
} from "react";
import { uniqBy } from "lodash";

import {
  convertApiEntityToBpEntity,
  convertApiEntityTypesToBpEntityTypes,
  convertApiEntityTypeToBpEntityType,
  convertApiLinkedAggregationToBpLinkedAggregation,
  convertApiLinkGroupsToBpLinkGroups,
} from "../../lib/entities";
import { fetchEmbedCode } from "./fetchEmbedCode";
import { RemoteBlock } from "../RemoteBlock/RemoteBlock";
import { useBlockLoaded } from "../../blocks/onBlockLoaded";
import { useBlockProtocolAggregateEntities } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregateEntities";
import { useBlockProtocolAggregateEntityTypes } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregateEntityTypes";
import { useBlockProtocolCreateEntity } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateEntity";
import { useBlockProtocolCreateEntityType } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateEntityType";
import { useBlockProtocolCreateLink } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateLink";
import { useBlockProtocolCreateLinkedAggregation } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateLinkedAggregation";
import { useBlockProtocolDeleteLink } from "../hooks/blockProtocolFunctions/useBlockProtocolDeleteLink";
import { useBlockProtocolDeleteLinkedAggregation } from "../hooks/blockProtocolFunctions/useBlockProtocolDeleteLinkedAggregation";
import { useBlockProtocolFileUpload } from "../hooks/blockProtocolFunctions/useBlockProtocolFileUpload";
import { useBlockProtocolUpdateEntity } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateEntity";
import { useBlockProtocolUpdateEntityType } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateEntityType";
import { useBlockProtocolUpdateLink } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateLink";
import { useBlockProtocolUpdateLinkedAggregation } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateLinkedAggregation";
import { EntityType as ApiEntityType } from "../../graphql/apiTypes.gen";

type BlockLoaderProps = {
  accountId: string;
  blockEntityId: string;
  block: HashBlock;
  editableRef: unknown;
  entityId: string;
  entityType?: Pick<ApiEntityType, "entityId" | "properties">;
  entityTypeId: string;
  entityProperties: {};
  linkGroups: BlockEntity["properties"]["entity"]["linkGroups"];
  linkedEntities: BlockEntity["properties"]["entity"]["linkedEntities"];
  linkedAggregations: BlockEntity["properties"]["entity"]["linkedAggregations"];
  onBlockLoaded: () => void;
  prosemirrorSchema: Schema;
  // shouldSandbox?: boolean;
};

// const sandboxingEnabled = !!process.env.NEXT_PUBLIC_SANDBOX;

/**
 * @see https://app.asana.com/0/1201095311341924/1202694273052398/f
 * @todo remove this when ticket is addressed
 */
const wrapTextProperties = (properties: {}) => {
  if (isTextProperties(properties)) {
    return { text: { __linkedData: {}, data: properties } };
  }

  return properties;
};

const prepareHashEntityProperties = (
  properties: {},
  blockSchema: HashBlock["schema"],
  prosemirrorSchema: Schema,
) => {
  const wrapped = wrapTextProperties(properties);

  if (isTextContainingEntityProperties(wrapped)) {
    const { text, ...otherProperties } = wrapped;
    if (blockSchema.properties?.text?.type === "string") {
      const textFragment = Fragment.from(
        childrenForTextEntity(text.data, prosemirrorSchema),
      );

      return {
        ...otherProperties,
        text: textFragment.textBetween(0, textFragment.size, "", (node) => {
          switch (node.type.name) {
            case "hardBreak": {
              return "\n";
            }
            case "mention": {
              // @todo find way of resolving the name of the mention here
              return "@MENTION_NAME_NOT_YET_SUPPORTED";
            }
          }

          return "";
        }),
      };
    }

    return otherProperties;
  }

  return wrapped;
};

/**
 * Converts API data to Block Protocol-formatted data (e.g. entities, links),
 * and passes the correctly formatted data to RemoteBlock, along with message callbacks
 */
export const BlockLoader: FunctionComponent<BlockLoaderProps> = ({
  accountId,
  blockEntityId,
  block,
  editableRef,
  entityId,
  entityType,
  entityTypeId,
  entityProperties,
  linkGroups,
  linkedEntities,
  linkedAggregations,
  onBlockLoaded,
  // shouldSandbox,
  prosemirrorSchema,
}) => {
  const { aggregateEntityTypes } =
    useBlockProtocolAggregateEntityTypes(accountId);
  const { aggregateEntities } = useBlockProtocolAggregateEntities(accountId);
  const { createLinkedAggregation } = useBlockProtocolCreateLinkedAggregation();
  const { createLink } = useBlockProtocolCreateLink();
  const { createEntity } = useBlockProtocolCreateEntity(accountId);
  const { createEntityType } = useBlockProtocolCreateEntityType(accountId);
  const { deleteLinkedAggregation } = useBlockProtocolDeleteLinkedAggregation();
  const { deleteLink } = useBlockProtocolDeleteLink();
  const { updateEntity } = useBlockProtocolUpdateEntity();
  const { uploadFile } = useBlockProtocolFileUpload(accountId);
  const { updateEntityType } = useBlockProtocolUpdateEntityType();
  const { updateLinkedAggregation } = useBlockProtocolUpdateLinkedAggregation();

  const { updateLink } = useBlockProtocolUpdateLink();

  const graphProperties = useMemo<
    Required<BlockGraphProperties<UnknownRecord>["graph"]>
  >(() => {
    const convertedEntityTypesForProvidedEntities: BpEntityType[] = [];

    if (entityType) {
      convertedEntityTypesForProvidedEntities.push(
        convertApiEntityTypeToBpEntityType(entityType),
      );
    }

    const convertedLinkedEntities: BpEntity[] = [];
    for (const entity of linkedEntities ?? []) {
      convertedLinkedEntities.push(convertApiEntityToBpEntity(entity));
      convertedEntityTypesForProvidedEntities.push(
        convertApiEntityTypeToBpEntityType(entity.entityType),
      );
    }

    const convertedLinkedAggregations: BpLinkedAggregation[] = [];
    for (const linkedAggregation of linkedAggregations ?? []) {
      convertedLinkedAggregations.push(
        convertApiLinkedAggregationToBpLinkedAggregation(linkedAggregation),
      );
      convertedEntityTypesForProvidedEntities.push(
        ...convertApiEntityTypesToBpEntityTypes(
          linkedAggregation.results.map(
            ({ entityType: resultEntityType }) => resultEntityType,
          ),
        ),
      );
    }

    const blockEntity = convertApiEntityToBpEntity({
      accountId,
      entityId: entityId ?? "entityId-not-yet-set", // @todo ensure blocks always get sent an entityId
      entityTypeId,
      properties: prepareHashEntityProperties(
        entityProperties,
        block.schema,
        prosemirrorSchema,
      ),
    });

    return {
      blockEntity,
      blockGraph: {
        depth: 1,
        linkGroups: convertApiLinkGroupsToBpLinkGroups(linkGroups),
        linkedEntities: convertedLinkedEntities,
      },
      entityTypes: uniqBy(
        convertedEntityTypesForProvidedEntities,
        "entityTypeId",
      ),
      linkedAggregations: convertedLinkedAggregations,
    };
  }, [
    entityType,
    accountId,
    entityId,
    entityTypeId,
    entityProperties,
    block.schema,
    prosemirrorSchema,
    linkGroups,
    linkedEntities,
    linkedAggregations,
  ]);

  const functions = {
    aggregateEntityTypes,
    aggregateEntities,
    createEntity,
    createEntityType,
    createLinkedAggregation,
    createLink,
    deleteLinkedAggregation,
    deleteLink,
    /**
     * @todo remove this when embed block no longer relies on server-side oEmbed calls
     * @see https://app.asana.com/0/1200211978612931/1202509819279267/f
     */
    getEmbedBlock: fetchEmbedCode,
    updateEntity,
    updateEntityType,
    uploadFile,
    updateLink,
    updateLinkedAggregation,
  };

  const onBlockLoadedFromContext = useBlockLoaded();
  const onBlockLoadedRef = useRef(onBlockLoaded);

  useLayoutEffect(() => {
    onBlockLoadedRef.current = onBlockLoaded;
  });

  const onRemoteBlockLoaded = useCallback(() => {
    onBlockLoadedFromContext(blockEntityId);
    onBlockLoadedRef?.current();
  }, [blockEntityId, onBlockLoadedFromContext]);

  // @todo upgrade sandbox for BP 0.2 and remove feature flag
  // if (sandboxingEnabled && (shouldSandbox || sourceUrl.endsWith(".html"))) {
  //   return (
  //     <BlockFramer
  //       sourceUrl={sourceUrl}
  //       blockProperties={{
  //         ...blockProperties,
  //         entityId: blockProperties.entityId ?? null,
  //         entityTypeId: blockProperties.entityTypeId ?? null,
  //       }}
  //       onBlockLoaded={onRemoteBlockLoaded}
  //       {...functions}
  //     />
  //   );
  // }

  return (
    <RemoteBlock
      blockMetadata={block.meta}
      editableRef={editableRef}
      graphCallbacks={functions}
      graphProperties={graphProperties}
      onBlockLoaded={onRemoteBlockLoaded}
    />
  );
};
