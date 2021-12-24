import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  VoidFunctionComponent,
} from "react";
import router from "next/router";
import { blockDomId } from "../../blocks/page/BlockView";
import { useBlockProtocolUpdateEntities } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateEntities";
import { cloneEntityTreeWithPropertiesMovedUp } from "../../lib/entities";
import { fetchEmbedCode } from "./fetchEmbedCode";
import { BlockFramer } from "../sandbox/BlockFramer/BlockFramer";
import { RemoteBlock } from "../RemoteBlock/RemoteBlock";
import { useBlockProtocolAggregateEntityTypes } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregateEntityTypes";
import { useBlockProtocolAggregateEntities } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregateEntities";
import { useFileUpload } from "../hooks/useFileUpload";

type BlockLoaderProps = {
  shouldSandbox?: boolean;
  sourceUrl: string;
  blockEntityId: string;
  editableRef: unknown;
  accountId: string;
  entityId: string | undefined;
  entityProperties: {};
};

const sandboxingEnabled = !!process.env.NEXT_PUBLIC_SANDBOX;

export const BlockLoader: VoidFunctionComponent<BlockLoaderProps> = ({
  shouldSandbox,
  sourceUrl,
  blockEntityId,
  editableRef,
  accountId,
  entityId,
  entityProperties,
}) => {
  const { aggregateEntityTypes } =
    useBlockProtocolAggregateEntityTypes(accountId);
  const { updateEntities } = useBlockProtocolUpdateEntities(accountId);
  const { aggregateEntities } = useBlockProtocolAggregateEntities(accountId);
  const { uploadFile } = useFileUpload(accountId);

  const flattenedProperties = useMemo(
    () =>
      cloneEntityTreeWithPropertiesMovedUp({
        accountId,
        properties: entityProperties,
      }),
    [accountId, entityProperties],
  );

  const blockProperties = { ...flattenedProperties, entityId };

  const functions = {
    aggregateEntityTypes,
    updateEntities,
    aggregateEntities,
    /** @todo pick one of getEmbedBlock or fetchEmbedCode */
    getEmbedBlock: fetchEmbedCode,
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
  }, [blockLoaded, blockEntityId]);

  if (sandboxingEnabled && (shouldSandbox || sourceUrl.endsWith(".html"))) {
    return (
      <BlockFramer
        sourceUrl={sourceUrl}
        blockProperties={{
          ...blockProperties,
          entityId: blockProperties.entityId ?? null,
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
      editableRef={editableRef}
      onBlockLoaded={onBlockLoaded}
      sourceUrl={sourceUrl}
    />
  );
};
