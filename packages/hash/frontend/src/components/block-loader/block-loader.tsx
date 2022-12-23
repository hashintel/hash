import { UnknownRecord } from "@blockprotocol/core";
import {
  BlockGraph,
  BlockGraphProperties,
  EntityType as BpEntityType,
} from "@blockprotocol/graph";
import { HashBlockMeta } from "@hashintel/hash-shared/blocks";
import { JsonSchema } from "@hashintel/hash-shared/json-utils";
import { EntityId } from "@hashintel/hash-subgraph";
import { uniqBy } from "lodash";
import {
  FunctionComponent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { useLocalstorageState } from "rooks";

import { useBlockLoadedContext } from "../../blocks/on-block-loaded";
import { useBlockContext } from "../../blocks/page/block-context";
import { convertApiEntityToBpEntity } from "../../lib/entities";
import { useIsReadonlyMode } from "../../shared/readonly-mode";
import { useBlockProtocolAggregateEntities } from "../hooks/block-protocol-functions/knowledge/use-block-protocol-aggregate-entities";
import { useBlockProtocolFileUpload } from "../hooks/block-protocol-functions/use-block-protocol-file-upload";
import { RemoteBlock } from "../remote-block/remote-block";
import { DataMapEditor } from "./data-map-editor";
import { fetchEmbedCode } from "./fetch-embed-code";
import { SchemaMap } from "./shared";

// @todo consolidate these properties, e.g. take all entityX, linkX into a single childEntity prop
// @see https://app.asana.com/0/1200211978612931/1202807842439190/f
type BlockLoaderProps = {
  blockEntityId: string;
  blockMetadata: HashBlockMeta;
  blockSchema: JsonSchema;
  editableRef: (node: HTMLElement | null) => void;
  entityId: EntityId;
  entityTypeId: string;
  entityProperties: {};
  onBlockLoaded: () => void;
  // shouldSandbox?: boolean;
};

// const sandboxingEnabled = !!process.env.NEXT_PUBLIC_SANDBOX;

/**
 * Converts API data to Block Protocol-formatted data (e.g. entities, links),
 * and passes the correctly formatted data to RemoteBlock, along with message callbacks
 */
export const BlockLoader: FunctionComponent<BlockLoaderProps> = ({
  blockEntityId,
  blockMetadata,
  blockSchema,
  editableRef,
  entityId,
  entityTypeId,
  entityProperties,
  onBlockLoaded,
  // shouldSandbox,
}) => {
  const isReadonlyMode = useIsReadonlyMode();
  const { aggregateEntities } = useBlockProtocolAggregateEntities();
  const { uploadFile } = useBlockProtocolFileUpload(isReadonlyMode);

  const { showDataMappingUi, setShowDataMappingUi } = useBlockContext();

  // Storing these in local storage is a temporary solution – we want them in the db soon
  // Known issue: this hook always sets _some_ value in local storage, so we end up with unnecessary things stored there
  const mapId = `${entityTypeId}:${blockMetadata.source}`;
  const [schemaMap, setSchemaMap] = useLocalstorageState<SchemaMap>(
    `map:${mapId}`,
    { mapId },
  );

  const graphProperties = useMemo<
    Required<BlockGraphProperties<UnknownRecord>["graph"]>
  >(() => {
    const convertedEntityTypesForProvidedEntities: BpEntityType[] = [];

    const blockEntity = convertApiEntityToBpEntity({
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
      entityId: entityId ?? "entityId-not-yet-set", // @todo ensure blocks always get sent an entityId
      entityTypeId,
      properties: entityProperties,
    });

    return {
      blockEntity,
      entityTypes: uniqBy(
        convertedEntityTypesForProvidedEntities,
        "entityTypeId",
      ),
      readonly: isReadonlyMode,
      // We currently don't construct a block graph or linked aggregations.
      blockGraph: {} as BlockGraph,
      linkedAggregations: [],
    };
  }, [entityId, entityProperties, entityTypeId, isReadonlyMode]);

  const functions = {
    aggregateEntities,
    /**
     * @todo remove this when embed block no longer relies on server-side oEmbed calls
     * @see https://app.asana.com/0/1200211978612931/1202509819279267/f
     */
    getEmbedBlock: fetchEmbedCode,
    uploadFile,
  };

  const onBlockLoadedFromContext = useBlockLoadedContext().onBlockLoaded;
  const onBlockLoadedRef = useRef(onBlockLoaded);

  useLayoutEffect(() => {
    onBlockLoadedRef.current = onBlockLoaded;
  });

  const onRemoteBlockLoaded = useCallback(() => {
    onBlockLoadedFromContext(blockEntityId);
    onBlockLoadedRef.current();
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

  if (showDataMappingUi) {
    return (
      <DataMapEditor
        onClose={() => setShowDataMappingUi(false)}
        schemaMap={schemaMap}
        sourceBlockEntity={{
          ...graphProperties.blockEntity,
          properties: entityProperties,
        }}
        sourceBlockGraph={graphProperties.blockGraph}
        targetSchema={blockSchema}
        transformedTree={graphProperties.blockEntity.properties}
        onSchemaMapChange={setSchemaMap}
      />
    );
  }

  return (
    <RemoteBlock
      blockMetadata={blockMetadata}
      editableRef={editableRef}
      graphCallbacks={functions}
      graphProperties={graphProperties}
      onBlockLoaded={onRemoteBlockLoaded}
    />
  );
};
