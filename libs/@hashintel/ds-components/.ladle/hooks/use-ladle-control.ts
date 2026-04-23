import { ActionType, ModeState, useLadleContext } from "@ladle/react";
import { useIsFirstRender } from "@mantine/hooks";
import { useCallback, useLayoutEffect, useRef } from "react";

const isLazyInitializer = <T>(value: T | (() => T)): value is () => T =>
  typeof value === "function";

const isUpdater = <T>(
  value: T | ((prev: T | undefined) => T) | undefined,
): value is (prev: T | undefined) => T => typeof value === "function";

export function useLadleControl<T>(
  paramName: string,
  initialValue?: T | (() => T),
) {
  const {
    globalState: { control: state },
    dispatch,
  } = useLadleContext();

  // NOTE: not sure if this is needed; only if the init value is somehow dynamic
  const isUnset = useRef(!(paramName in state));
  if (isUnset.current) {
    isUnset.current = false;
    if (initialValue != null) {
      dispatch({
        type: ActionType.UpdateControl,
        value: {
          ...state,
          [paramName]: {
            ...state[paramName],
            value: isLazyInitializer(initialValue)
              ? initialValue()
              : initialValue,
          },
        },
      });
    }
  }

  return useCallback(
    (value?: T | ((prev: T | undefined) => T)) => {
      dispatch({
        type: ActionType.UpdateControl,
        value: {
          ...state,
          [paramName]: {
            ...state[paramName],
            value: isUpdater(value)
              ? value(state[paramName]?.value as T | undefined)
              : (value ?? ("transparent" as T)),
          },
        },
      });
    },
    [dispatch, paramName, state],
  );
}

/**
 * Hook to detect if Ladle is currently in fullscreen (preview) mode.
 *
 * @returns boolean - true if in fullscreen mode, false otherwise
 */
export function useLadleIsPreview(): boolean {
  const { globalState } = useLadleContext();
  return globalState.mode === ModeState.Preview;
}

/**
 * Hook to programmatically set the background color of the Ladle story canvas.
 *
 * @param initialColor - Initial background color (optional)
 * @returns A function to set the background color
 */
export function useLadleBackground(initialColor?: string & {}) {
  const setLadleBackground = useLadleControl("background", initialColor);
  const isFirstRender = useIsFirstRender();
  useLayoutEffect(() => {
    if (initialColor && isFirstRender) {
      setLadleBackground(initialColor);
    }
  }, [initialColor, setLadleBackground, isFirstRender]);

  return setLadleBackground;
}
