import { useEffect } from "react";

/**
 * Registers a browser-level close/reload/navigation warning while `shouldBlock`
 * is true. Browsers intentionally make this best-effort: the prompt text is
 * browser-controlled, repeated prompts may be suppressed, and some platforms
 * may skip `beforeunload` entirely. This should be treated as a guardrail, not
 * a guarantee that the window cannot be closed.
 */
export function useBlockWindowClose({
  shouldBlock,
}: {
  shouldBlock: boolean;
}): void {
  useEffect(() => {
    if (!shouldBlock) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      Reflect.set(event, "returnValue", "");
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [shouldBlock]);
}
