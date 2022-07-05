import {
  RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  VoidFunctionComponent,
} from "react";

import {
  BlockHookProperties,
  HookBlockHandler,
  HookEmbedderHandler,
} from "./index";

export type BlockComponent<
  Properties extends Record<string, unknown> | null = null,
> = VoidFunctionComponent<BlockHookProperties<Properties>>;

const useHookServiceConstructor = <
  T extends typeof HookBlockHandler | typeof HookEmbedderHandler,
>({
  Handler,
  constructorArgs,
  ref,
}: {
  Handler: T;
  constructorArgs?: Omit<ConstructorParameters<T>[0], "element">;
  ref: RefObject<HTMLElement>;
}) => {
  const previousRef = useRef<HTMLElement | null>(null);

  const [hookService, setHookService] = useState<
    | (T extends typeof HookBlockHandler
        ? HookBlockHandler
        : HookEmbedderHandler)
    | null
  >(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- will not loop & we don't want to reconstruct on other args
  useEffect(() => {
    if (ref.current === previousRef.current) {
      return;
    }

    if (previousRef.current) {
      hookService?.destroy();
    }

    previousRef.current = ref.current;

    if (ref.current) {
      setHookService(
        new Handler({
          element: ref.current,
          ...(constructorArgs as unknown as ConstructorParameters<T>), // @todo fix these casts
        }) as T extends typeof HookBlockHandler // @todo fix these casts
          ? HookBlockHandler
          : HookEmbedderHandler,
      );
    }
  });

  return { hookService };
};

/**
 * Create a HookBlockHandler instance, using a reference to an element in the block.
 *
 * The hookService will only be reconstructed if the element reference changes.
 * Updates to any callbacks after first constructing should be made by calling hookService.on("messageName", callback);
 */
export const useHookBlockService = (
  ref: RefObject<HTMLElement>,
  constructorArgs?: Omit<
    ConstructorParameters<typeof HookBlockHandler>[0],
    "element"
  >,
): { hookService: HookBlockHandler | null } => {
  return useHookServiceConstructor({
    Handler: HookBlockHandler,
    constructorArgs,
    ref,
  });
};

export const useHookRef = (
  handler: HookBlockHandler | null,
  value?: unknown,
  onError?: (...args: any[]) => unknown,
) => {
  const currentValue = useRef(value);
  const currentOnError = useRef(onError);
  const currentNode = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    currentValue.current = value;
    currentOnError.current = onError;
  });

  useLayoutEffect(() => {
    const node = currentNode.current;

    if (node && handler) {
      handler.node(currentValue.current, node).catch((err) => {
        currentOnError.current?.(err);
      });
    }
  }, [handler, value]);

  return currentNode;
};

/**
 * Create a HookBlockHandler instance, using a reference to an element in the block.
 *
 * The hookService will only be reconstructed if the element reference changes.
 * Updates to any callbacks after first constructing should be made by calling hookService.on("messageName", callback);
 */
export const useHookEmbedderService = (
  ref: RefObject<HTMLElement>,
  constructorArgs?: Omit<
    ConstructorParameters<typeof HookEmbedderHandler>[0],
    "element"
  >,
): { hookService: HookEmbedderHandler | null } => {
  return useHookServiceConstructor({
    Handler: HookEmbedderHandler,
    ref,
    constructorArgs,
  });
};
