import { BlockComponent } from "@blockprotocol/graph/react";
import { HookBlockHandler, useHookBlockService } from "@blockprotocol/hook";
import { RefObject, useLayoutEffect, useRef, useState } from "react";

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

    console.log(existingHook, service, node, path, type);

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
      console.log(service.destroyed);
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
  const headerRef = useRef<HTMLHeadingElement>(null);
  const { hookService } = useHookBlockService(headerRef);
  // const headerHookRef = useHookRef(hookService, "text", "$.text", (node) => {
  //   if (node) {
  //     // eslint-disable-next-line no-param-reassign
  //     node.innerText = text ?? "";
  //   }
  // });

  useHook(hookService, headerRef, "text", "$.text", (node) => {
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
    <Header
      style={{ fontFamily: "Arial", color: color ?? "black", marginBottom: 0 }}
      ref={headerRef}
    />
  );
};
