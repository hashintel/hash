import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  VoidFunctionComponent,
} from "react";
import router from "next/router";

import { useBlockProtocolUpdate } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdate";
import { cloneEntityTreeWithPropertiesMovedUp } from "../../lib/entities";
import { fetchEmbedCode } from "./fetchEmbedCode";
import { uploadFile } from "./uploadFile";
import { BlockFramer } from "../sandbox/BlockFramer/BlockFramer";
import { RemoteBlock } from "../RemoteBlock/RemoteBlock";
import { useBlockProtocolAggregateEntityTypes } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregateEntityTypes";
import { useBlockProtocolAggregate } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregate";

type BlockLoaderProps = {
  shouldSandbox?: boolean;
  sourceUrl: string;
  entityId?: string;
} & Record<string, any>;

const sandboxingEnabled = !!process.env.NEXT_PUBLIC_SANDBOX;

export const BlockLoader: VoidFunctionComponent<BlockLoaderProps> = ({
  sourceUrl,
  shouldSandbox,
  entityId,
  ...props
}) => {
  const { aggregateEntityTypes } = useBlockProtocolAggregateEntityTypes(
    props.accountId,
  );
  const { update } = useBlockProtocolUpdate(props.accountId);
  const { aggregate } = useBlockProtocolAggregate(props.accountId);

  const flattenedProperties = useMemo(
    () => cloneEntityTreeWithPropertiesMovedUp(props),
    [props],
  );

  const blockProperties = {
    ...flattenedProperties,
    editableRef: props.editableRef,
    /** @todo have this passed in to RemoteBlock as entityId, not childEntityId */
    entityId: props.childEntityId,
  };

  const functions = {
    aggregateEntityTypes,
    update,
    aggregate,
    /** @todo pick one of getEmbedBlock or fetchEmbedCode */
    getEmbedBlock: fetchEmbedCode,
    uploadFile,
  };

  const [scrollingComplete, setScrollingComplete] = useState(false);
  const scrollIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const scrollFrameRequestIdRef = useRef<ReturnType<
    typeof requestAnimationFrame
  > | null>(null);

  const [blockLoaded, setBlockLoaded] = useState(false);

  const onBlockLoaded = () => {
    setBlockLoaded(true);
  };

  useEffect(() => {
    const routeHash = router.asPath.split("#")[1];

    function frame() {
      const routeElement = document.getElementById(routeHash);

      if (routeElement) {
        console.log("scrolling");
        routeElement.scrollIntoView();
        setScrollingComplete(true);
      }

      // Do we need to do this if we've scrolled into view
      scrollFrameRequestIdRef.current = requestAnimationFrame(frame);
    }

    function clearScrollInterval() {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }

      if (scrollFrameRequestIdRef.current !== null) {
        cancelAnimationFrame(scrollFrameRequestIdRef.current);
        scrollFrameRequestIdRef.current = null;
      }
    }

    console.log({
      scrollingComplete,
      router,
      blockLoaded,
    });

    if (routeHash === entityId && !scrollingComplete && blockLoaded) {
      console.log("scrollRef set");
      clearScrollInterval();
      scrollFrameRequestIdRef.current = requestAnimationFrame(frame);
    }

    return () => {
      clearScrollInterval();
    };
  }, [scrollingComplete, router, blockLoaded]);

  if (sandboxingEnabled && (shouldSandbox || sourceUrl.endsWith(".html"))) {
    return (
      <BlockFramer
        sourceUrl={sourceUrl}
        blockProperties={blockProperties}
        onBlockLoaded={onBlockLoaded}
        {...functions}
      />
    );
  }

  return (
    <RemoteBlock
      {...blockProperties}
      {...functions}
      onBlockLoaded={onBlockLoaded}
      sourceUrl={sourceUrl}
    />
  );
};
