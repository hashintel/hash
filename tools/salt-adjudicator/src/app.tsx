import { render } from "preact";
import { useCallback, useEffect, useRef } from "preact/hooks";

import { useAppController } from "./app/app-controller.ts";
import { parseEmbeddedPayload } from "./app/app-controller.ts";
import { AppView } from "./app/app-view.tsx";

const appElement = document.querySelector<HTMLElement>("#app");
const liveRegion = document.querySelector<HTMLElement>("#live-region");
const payloadElement = document.querySelector<HTMLScriptElement>("#salt-study");

if (!appElement || !liveRegion || !payloadElement) {
  throw new Error("SALT could not find its required application elements.");
}

const embeddedPayload = parseEmbeddedPayload(payloadElement.textContent);

export const App = () => {
  const announcementFrame = useRef<number | null>(null);
  const announce = useCallback((message: string): void => {
    liveRegion.textContent = "";
    if (announcementFrame.current !== null) {
      window.cancelAnimationFrame(announcementFrame.current);
    }
    announcementFrame.current = window.requestAnimationFrame(() => {
      liveRegion.textContent = message;
      announcementFrame.current = null;
    });
  }, []);
  useEffect(
    () => () => {
      if (announcementFrame.current !== null) {
        window.cancelAnimationFrame(announcementFrame.current);
      }
    },
    [],
  );

  const controller = useAppController(embeddedPayload, announce);
  return <AppView controller={controller} />;
};

render(<App />, appElement);
