import { BlockMetadata, UnknownRecord } from "@blockprotocol/core";
import {
  BlockGraphProperties,
  EmbedderGraphMessageCallbacks,
} from "@blockprotocol/graph";
import {
  BlockComponent,
  useGraphEmbedderService,
} from "@blockprotocol/graph/react";
import {
  HookBlockHandler,
  useHookBlockService,
  useHookEmbedderService,
} from "@blockprotocol/hook";
import {
  FunctionComponent,
  RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { v4 as uuid } from "uuid";

type BlockEntityProperties = {
  color?: string;
  level?: number;
  text?: string;
};

type Hook<T extends HTMLElement> = {
  id: string | null;
  teardown: (() => Promise<void>) | null;
  params: {
    service: HookBlockHandler | null;
    node: T;
    type: string;
    path: string;
  };
};

export const useHook = <T extends HTMLElement>(
  service: HookBlockHandler | null,
  ref: RefObject<T | null | void>,
  type: string,
  path: string,
  fallback: (node: T) => void | (() => void),
) => {
  const hookRef = useRef<null | Hook<T>>(null);
  const [, setError] = useState();

  const fallbackRef = useRef(fallback);

  useLayoutEffect(() => {
    fallbackRef.current = fallback;
  });

  useLayoutEffect(() => {
    return () => {
      hookRef.current?.teardown?.().catch((err) => {
        setError(() => {
          throw err;
        });
      });
    };
  }, []);

  useLayoutEffect(() => {
    const existingHook = hookRef.current?.params;
    const node = ref.current;

    if (
      existingHook &&
      existingHook.service === service &&
      existingHook.node === node &&
      existingHook.path === path &&
      existingHook.type === type
    ) {
      return;
    }

    const teardownPromise =
      hookRef.current?.teardown?.().catch() ?? Promise.resolve();

    if (node && service) {
      const controller = new AbortController();

      const reuseId =
        existingHook &&
        existingHook.service === service &&
        existingHook.path === path &&
        existingHook.type === type;

      const hook: Hook<T> = {
        id: reuseId ? hookRef.current?.id ?? null : null,
        params: {
          service,
          type,
          path,
          node,
        },
        teardown: async () => {
          controller.abort();

          if (hook.id) {
            try {
              hook.id = null;
              if (hookRef.current === hook) {
                hookRef.current = null;
              }

              if (!service.destroyed) {
                await service.hook({
                  data: {
                    hookId: hook.id,
                    path,
                    type,
                    node: null,
                  },
                });
              }
            } catch (err) {
              setError(() => {
                throw err;
              });
            }
          }
        },
      };

      hookRef.current = hook;

      teardownPromise
        .then(() => {
          if (service.destroyed) {
            return;
          }

          return service
            .hook({
              data: {
                hookId: hook.id,
                node,
                type,
                path,
              },
            })
            .then((response) => {
              if (!controller.signal.aborted) {
                if (response.errors) {
                  if (
                    response.errors.length === 1 &&
                    response.errors[0]?.code === "NOT_IMPLEMENTED"
                  ) {
                    const teardown = fallbackRef.current(node);

                    hook.teardown = async () => {
                      controller.abort();
                      teardown?.();
                    };
                  } else {
                    // eslint-disable-next-line no-console
                    console.error(response.errors);
                    throw new Error("Unknown error in hook");
                  }
                } else if (response.data) {
                  hook.id = response.data.hookId;
                }
              }
            });
        })
        .catch((err) => {
          setError(() => {
            throw err;
          });
        });
    } else {
      hookRef.current = null;
    }
  });
};

export const App: BlockComponent<BlockEntityProperties> = ({
  graph: {
    blockEntity: {
      properties: { color, level = 1, text },
    },
  },
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const header2Ref = useRef<HTMLHeadingElement>(null);
  const { hookService } = useHookBlockService(containerRef);
  // const headerHookRef = useHookRef(hookService, "text", "$.text", (node) => {
  //   if (node) {
  //     // eslint-disable-next-line no-param-reassign
  //     node.innerText = text ?? "";
  //   }
  // });

  useHook(hookService, header2Ref, "text", "$.text", (node) => {
    // eslint-disable-next-line no-param-reassign
    node.innerText = text ?? "";

    return () => {
      // eslint-disable-next-line no-param-reassign
      node.innerText = "";
    };
  });

  // @todo set type correctly
  const Header = `h${level}` as any;

  return (
    <div ref={containerRef}>
      <Header
        style={{
          fontFamily: "Arial",
          color: color ?? "black",
          marginBottom: 0,
        }}
        ref={header2Ref}
      />
    </div>
  );
};

type RemoteBlockProps = {
  graphCallbacks: Omit<
    EmbedderGraphMessageCallbacks,
    | "getEntity"
    | "getEntityType"
    | "getLink"
    | "getLinkedAggregation"
    | "deleteEntity"
    | "deleteEntityType"
  >;
  graphProperties: Required<BlockGraphProperties<UnknownRecord>["graph"]>;
  blockMetadata: BlockMetadata;
  crossFrame?: boolean;
  editableRef?: (node: HTMLElement | null) => void;
  onBlockLoaded?: () => void;
};

export const BlockLoadingIndicator: FunctionComponent = () => (
  <div>Loading...</div>
);

/**
 * Loads and renders a block from a URL, instantiates the graph service handler,
 * and passes the block the provided graphProperties
 *
 * @see https://github.com/Paciolan/remote-component for the original inspiration
 */
export const RemoteBlock: FunctionComponent<RemoteBlockProps> = ({
  // blockMetadata,
  // crossFrame,
  editableRef,
  graphCallbacks,
  graphProperties,
  onBlockLoaded,
}) => {
  // const [loading, err, blockSource] = useRemoteBlock(
  //   blockMetadata.source,
  //   crossFrame,
  //   onBlockLoaded,
  // );

  const wrapperRef = useRef<HTMLDivElement>(null);

  const { graphService } = useGraphEmbedderService(wrapperRef, {
    callbacks: graphCallbacks,
    ...graphProperties,
  });

  useHookEmbedderService(wrapperRef, {
    callbacks: {
      async hook({ data }) {
        if (data?.type === "text" && data.path === "$.text") {
          editableRef?.(data.node);

          const hookId = data.hookId ?? uuid();
          return { data: { hookId } };
        }

        return {
          errors: [{ code: "NOT_IMPLEMENTED", message: "Improper hook" }],
        };
      },
    },
  });

  useEffect(() => {
    if (graphService) {
      graphService.blockEntity({ data: graphProperties.blockEntity });
    }
  }, [graphProperties.blockEntity, graphService]);

  useEffect(() => {
    onBlockLoaded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (graphService) {
      graphService.blockGraph({ data: graphProperties.blockGraph });
    }
  }, [graphProperties.blockGraph, graphService]);

  useEffect(() => {
    if (graphService) {
      graphService.entityTypes({ data: graphProperties.entityTypes });
    }
  }, [graphProperties.entityTypes, graphService]);

  useEffect(() => {
    if (graphService) {
      graphService.linkedAggregations({
        data: graphProperties.linkedAggregations,
      });
    }
  }, [graphProperties.linkedAggregations, graphService]);

  useEffect(() => {
    if (graphService) {
      graphService.readonly({
        data: graphProperties.readonly,
      });
    }
  }, [graphProperties.readonly, graphService]);

  // if (loading) {
  //   return <BlockLoadingIndicator />;
  // }
  //
  // if (!blockSource) {
  //   throw new Error("Could not load and parse block from URL");
  // }
  //
  // if (err) {
  //   throw err;
  // }

  const propsToInject: BlockGraphProperties<Record<string, any>> & {
    editableRef: any;
  } = {
    editableRef,
    graph: graphProperties,
  };

  return (
    <div ref={wrapperRef}>
      <App {...propsToInject} />

      {/*{graphService ? (*/}
      {/*  <BlockRenderer*/}
      {/*    blockSource={blockSource}*/}
      {/*    blockType={blockMetadata.blockType}*/}
      {/*    properties={propsToInject}*/}
      {/*    sourceUrl={blockMetadata.source}*/}
      {/*  />*/}
      {/*) : null}*/}
    </div>
  );
};
