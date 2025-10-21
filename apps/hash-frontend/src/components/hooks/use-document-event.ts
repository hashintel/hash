import { useEffect } from "react";

export function useDocumentEvent<K extends keyof DocumentEventMap>(
  type: K,
  listener: (this: Document, ev: DocumentEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
) {
  useEffect(() => {
    document.addEventListener(type, listener, options);
    return () => document.removeEventListener(type, listener, options);
  }, [type, listener, options]);
}
