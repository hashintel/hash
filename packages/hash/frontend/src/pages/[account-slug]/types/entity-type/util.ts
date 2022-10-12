import { bindToggle, bindTrigger } from "material-ui-popup-state/hooks";
import { SetStateAction, useLayoutEffect, useRef, useState } from "react";

/**
 * This allows you to pass a second parameter to the setState function which
 * will be called once the component has re-rendered
 *
 * @warning The callback will be called even if the setState is cancelled, and
 *          this is therefore not safe to call from render
 *
 */
export const useStateCallback = <T extends any>(initialValue: T) => {
  const [state, setState] = useState(initialValue);

  const callbacksRef = useRef<(() => void)[]>([]);
  const updateRef = useRef(
    (nextState: T | SetStateAction<T>, callback?: () => unknown) => {
      if (callback) {
        callbacksRef.current.push(callback);
      }
      setState(nextState);
    },
  );

  useLayoutEffect(() => {
    for (const callback of callbacksRef.current) {
      callback();
    }
    callbacksRef.current = [];
  });

  return [state, updateRef.current] as const;
};

// Call a function in addition to handling popup state on click
export const withHandler = <
  T extends ReturnType<typeof bindTrigger> | ReturnType<typeof bindToggle>,
>(
  trigger: T,
  handler: () => void,
): T => {
  return {
    ...trigger,
    onClick: (...args) => {
      handler();
      return trigger.onClick(...args);
    },
    onTouchStart: (...args) => {
      handler();
      return trigger.onTouchStart(...args);
    },
  };
};
