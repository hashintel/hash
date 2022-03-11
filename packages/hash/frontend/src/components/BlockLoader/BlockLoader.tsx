import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  VoidFunctionComponent,
} from "react";
import { useRouter } from "next/router";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import { BlockProtocolLinkedAggregation } from "blockprotocol";

import { blockDomId } from "../../blocks/page/BlockView";
import { useBlockProtocolUpdateEntities } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateEntities";
import { cloneEntityTreeWithPropertiesMovedUp } from "../../lib/entities";
import { fetchEmbedCode } from "./fetchEmbedCode";
import { BlockFramer } from "../sandbox/BlockFramer/BlockFramer";
import { RemoteBlock } from "../RemoteBlock/RemoteBlock";
import { useBlockProtocolAggregateEntityTypes } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregateEntityTypes";
import { useBlockProtocolAggregateEntities } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregateEntities";
import { useFileUpload } from "../hooks/useFileUpload";
import {
  LinkedAggregation,
  LinkGroup,
  UnknownEntity,
} from "../../graphql/apiTypes.gen";
import { useBlockProtocolCreateLinks } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateLinks";
import { useBlockProtocolDeleteLinks } from "../hooks/blockProtocolFunctions/useBlockProtocolDeleteLinks";
import { useBlockProtocolUpdateLinks } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateLinks";

type BlockLoaderProps = {
  accountId: string;
  blockEntityId: string;
  editableRef: unknown;
  entityId: string;
  entityTypeId: string | undefined;
  entityTypeVersionId: string | undefined;
  entityProperties: {};
  linkGroups: LinkGroup[];
  linkedEntities: BlockEntity["properties"]["entity"]["linkedEntities"];
  linkedAggregations: BlockEntity["properties"]["entity"]["linkedAggregations"];
  shouldSandbox?: boolean;
  sourceUrl: string;
};

const sandboxingEnabled = !!process.env.NEXT_PUBLIC_SANDBOX;

export const BlockLoader: VoidFunctionComponent<BlockLoaderProps> = ({
  accountId,
  blockEntityId,
  editableRef,
  entityId,
  entityTypeId,
  entityTypeVersionId,
  entityProperties,
  linkGroups,
  linkedEntities,
  linkedAggregations,
  shouldSandbox,
  sourceUrl,
}) => {
  const router = useRouter();

  const { aggregateEntityTypes } = useBlockProtocolAggregateEntityTypes();
  const { aggregateEntities } = useBlockProtocolAggregateEntities();
  const { createLinks } = useBlockProtocolCreateLinks();
  const { deleteLinks } = useBlockProtocolDeleteLinks();
  const { updateEntities } = useBlockProtocolUpdateEntities();
  const { uploadFile } = useFileUpload();
  const { updateLinks } = useBlockProtocolUpdateLinks();

  const flattenedProperties = useMemo(() => {
    let flattenedLinkedEntities: UnknownEntity[] = [];

    if (linkedEntities) {
      flattenedLinkedEntities = linkedEntities.map((linkedEntity) => {
        return cloneEntityTreeWithPropertiesMovedUp(linkedEntity);
      }) as UnknownEntity[];
    }

    return cloneEntityTreeWithPropertiesMovedUp({
      accountId,
      linkGroups,
      linkedEntities: flattenedLinkedEntities,
      linkedAggregations: linkedAggregations as LinkedAggregation[],
      properties: entityProperties,
    });
  }, [
    accountId,
    entityProperties,
    linkGroups,
    linkedEntities,
    linkedAggregations,
  ]);

  const blockProperties = {
    ...flattenedProperties,
    entityId,
    entityTypeId,
    entityTypeVersionId,
  };

  const functions = {
    aggregateEntityTypes,
    aggregateEntities,
    createLinks,
    deleteLinks,
    /** @todo pick one of getEmbedBlock or fetchEmbedCode */
    getEmbedBlock: fetchEmbedCode,
    updateEntities,
    updateLinks,
    uploadFile,
  };

  const scrollingComplete = useRef(false);
  const scrollFrameRequestIdRef = useRef<ReturnType<
    typeof requestAnimationFrame
  > | null>(null);

  const [blockLoaded, setBlockLoaded] = useState(false);

  const onBlockLoaded = useCallback(() => {
    setBlockLoaded(true);
  }, []);

  useEffect(() => {
    const routeHash = router.asPath.split("#")[1];

    function frame() {
      const routeElement = document.getElementById(routeHash);

      if (routeElement) {
        routeElement.scrollIntoView();
        scrollingComplete.current = true;
      }
    }

    function clearScrollInterval() {
      if (scrollFrameRequestIdRef.current !== null) {
        cancelAnimationFrame(scrollFrameRequestIdRef.current);
        scrollFrameRequestIdRef.current = null;
      }
    }

    if (
      routeHash === blockDomId(blockEntityId ?? "") &&
      !scrollingComplete.current &&
      blockLoaded
    ) {
      clearScrollInterval();
      scrollFrameRequestIdRef.current = requestAnimationFrame(frame);
    }

    return () => {
      clearScrollInterval();
    };
  }, [blockLoaded, blockEntityId, router.asPath]);

  if (sandboxingEnabled && (shouldSandbox || sourceUrl.endsWith(".html"))) {
    return (
      <BlockFramer
        sourceUrl={sourceUrl}
        blockProperties={{
          ...blockProperties,
          entityId: blockProperties.entityId ?? null,
          entityTypeId: blockProperties.entityTypeId ?? null,
          entityTypeVersionId: blockProperties.entityTypeVersionId ?? null,
        }}
        onBlockLoaded={onBlockLoaded}
        {...functions}
      />
    );
  }

  return (
    <RemoteBlock
      {...blockProperties}
      {...functions}
      linkedAggregations={
        blockProperties.linkedAggregations as BlockProtocolLinkedAggregation[]
      }
      editableRef={editableRef}
      onBlockLoaded={onBlockLoaded}
      sourceUrl={sourceUrl}
    />
  );
};
