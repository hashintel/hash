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
import { useBlockProtocolUpdate } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdate";
import { cloneEntityTreeWithPropertiesMovedUp } from "../../lib/entities";
import { fetchEmbedCode } from "./fetchEmbedCode";
import { BlockFramer } from "../sandbox/BlockFramer/BlockFramer";
import { BlockLoadingIndicator, RemoteBlock } from "../RemoteBlock/RemoteBlock";
import { useBlockProtocolAggregateEntityTypes } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregateEntityTypes";
import { useBlockProtocolAggregate } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregate";
import { useFileUpload } from "../hooks/useFileUpload";

type BlockLoaderProps = {
  shouldSandbox?: boolean;
  sourceUrl: string;
  entityId?: string;
  accountId?: string;
} & Record<string, any>;

type BlockLoaderBodyProps = BlockLoaderProps & {
  accountId: string;
};

const sandboxingEnabled = !!process.env.NEXT_PUBLIC_SANDBOX;

const BlockLoaderBody: VoidFunctionComponent<BlockLoaderBodyProps> = ({
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
      routeHash === blockDomId(entityId ?? "") &&
      !scrollingComplete.current &&
      blockLoaded
    ) {
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

export const BlockLoader: VoidFunctionComponent<BlockLoaderProps> = ({
  props,
}) => {
  if (!props.accountId) {
    return <BlockLoadingIndicator />;
  }

  return <BlockLoaderBody {...props} />;
};
