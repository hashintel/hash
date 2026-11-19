import { act } from "@testing-library/react";

/**
 * Waits for the next frame, in which Motion writes bound styles and works
 * computed readings out again.
 */
export const nextFrame = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      }),
  );
