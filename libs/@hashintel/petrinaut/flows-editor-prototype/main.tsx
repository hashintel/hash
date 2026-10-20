import "../src/ui/index.css";
import { useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

import { Editor, Screens } from "./src/app";
import { findScreenState } from "./src/states";

const params = new URLSearchParams(location.search);

/** Scales each screens-page frame to its box, so the 1440 × 900 editor fits two to a row. */
const ScreensPage = () => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const update = () => {
      for (const frame of ref.current?.querySelectorAll("iframe") ?? []) {
        const width = frame.parentElement?.clientWidth ?? 1440;
        frame.style.setProperty("--frame-scale", String(width / 1440));
      }
    };
    update();
    globalThis.addEventListener("resize", update);
    return () => globalThis.removeEventListener("resize", update);
  });
  return (
    <div ref={ref}>
      <Screens />
    </div>
  );
};

/**
 * The Flows editor prototype on its own page. `?state=<id>` opens one screen (see `src/states.ts`); `?screens`
 * lays every screen out side by side. With neither, it opens the blank canvas.
 */
const App = () => {
  if (params.has("screens")) {
    return <ScreensPage />;
  }
  const state =
    findScreenState(params.get("state")) ?? findScreenState("blank")!;
  const { document, ui } = state.create();
  return <Editor key={state.id} initialDocument={document} initialUi={ui} />;
};

createRoot(document.getElementById("root")!).render(<App />);
