import { useUserSettings } from "../../../../../../react/state/user-settings-context";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

/** Whether transitions play: the animations setting is on and the viewer did not ask for reduced motion. */
export const useAnimationsEnabled = (): boolean => {
  const showAnimations = useUserSettings((settings) => settings.showAnimations);
  const reducedMotion = usePrefersReducedMotion();
  return showAnimations && !reducedMotion;
};
