import React, {
  useCallback,
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
import { BlockFramer } from "../sandbox/BlockFramer/BlockFramer";
import { RemoteBlock } from "../RemoteBlock/RemoteBlock";
import { useBlockProtocolAggregateEntityTypes } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregateEntityTypes";
import { useBlockProtocolAggregate } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregate";
import { useFileUpload } from "../hooks/useFileUpload";

type BlockLoaderProps = {
  shouldSandbox?: boolean;
  sourceUrl: string;
  entityId?: string;
} & Record<string, any>;

const sandboxingEnabled = !!process.env.NEXT_PUBLIC_SANDBOX;

type SerializeDates<T> = T extends Date
  ? string
  : T extends [...any[]]
  ? {
      [I in keyof T]: SerializeDates<T[I]>;
    }
  : T extends {}
  ? {
      [K in keyof T]: SerializeDates<T[K]>;
    }
  : T;

/**
 * This ensures dates we pass through to blocks are strings, as the block
 * protocol expects properties to be JSON
 */
function mutateSerializeDates<T extends {}>(value: T): SerializeDates<T> {
  const anyValue = value as unknown;

  if (anyValue instanceof Date) {
    return anyValue.toJSON() as any;
  }

  if (typeof anyValue !== "object" || !anyValue) {
    return anyValue as any;
  }

  for (const innerValue of Object.values(anyValue)) {
    mutateSerializeDates(innerValue);
  }

  return anyValue as any;
}

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
  const { uploadFile } = useFileUpload(props.accountId);

  const flattenedProperties = useMemo(
    () => mutateSerializeDates(cloneEntityTreeWithPropertiesMovedUp(props)),
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

      // Do we need to do this if we've scrolled into view
      scrollFrameRequestIdRef.current = requestAnimationFrame(frame);
    }

    function clearScrollInterval() {
      if (scrollFrameRequestIdRef.current !== null) {
        cancelAnimationFrame(scrollFrameRequestIdRef.current);
        scrollFrameRequestIdRef.current = null;
      }
    }

    if (routeHash === entityId && !scrollingComplete.current && blockLoaded) {
      clearScrollInterval();
      scrollFrameRequestIdRef.current = requestAnimationFrame(frame);
    }

    return () => {
      clearScrollInterval();
    };
  }, [router, blockLoaded]);

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
