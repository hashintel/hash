import { bindToggle, bindTrigger } from "material-ui-popup-state/hooks";

// Call a function in addition to handling popup state on click
export const withHandler = <
  T extends ReturnType<typeof bindTrigger> | ReturnType<typeof bindToggle>,
>(
  trigger: T,
  handler: undefined | (() => void),
): T => {
  return {
    ...trigger,
    onClick: (...args) => {
      handler?.();
      return trigger.onClick(...args);
    },
    onTouchStart: (...args) => {
      handler?.();
      return trigger.onTouchStart(...args);
    },
  };
};
