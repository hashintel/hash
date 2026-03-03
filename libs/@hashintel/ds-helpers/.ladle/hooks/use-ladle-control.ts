import { ActionType, ModeState, useLadleContext } from "@ladle/react";
import { useIsFirstRender } from "@mantine/hooks";
import { isFunction } from "@tool-belt/type-predicates";
import { useCallback, useLayoutEffect, useRef } from "react";

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
            value: isFunction(initialValue) ? initialValue() : initialValue,
          },
        },
      });
    }
  }

  return useCallback(
    (value?: T | ((prev: T) => T)) => {
      dispatch({
        type: ActionType.UpdateControl,
        value: {
          ...state,
          [paramName]: {
            ...state[paramName],
            value: isFunction(value)
              ? value(state[paramName]?.value)
              : (value ?? "transparent"),
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
