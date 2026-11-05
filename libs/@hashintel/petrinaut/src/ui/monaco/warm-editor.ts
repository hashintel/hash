import { CODE_FONT_FAMILY } from "../constants/ui";

import type { MonacoContextValue } from "./context";
import type { editor } from "monaco-editor";

const warmed = new WeakSet<MonacoContextValue["monaco"]>();

export const warmEditor = (monaco: MonacoContextValue["monaco"]) => {
  let active = true;
  let idle: number | undefined;
  let frame: number | undefined;
  let host: HTMLDivElement | undefined;
  let instance: editor.IStandaloneCodeEditor | undefined;
  const dispose = () => {
    instance?.getModel()?.dispose();
    instance?.dispose();
    instance = undefined;
    host?.remove();
    host = undefined;
  };

  // Match the real font before Monaco caches its first text measurements.
  void document.fonts.load(`12px ${CODE_FONT_FAMILY}`).then(
    () => {
      if (
        !active ||
        warmed.has(monaco) ||
        typeof window.requestIdleCallback !== "function"
      )
        return;
      idle = window.requestIdleCallback(() => {
        if (warmed.has(monaco)) return;
        warmed.add(monaco);
        if (monaco.editor.getEditors().length > 0) return;
        host = document.createElement("div");
        host.inert = true;
        host.setAttribute("aria-hidden", "true");
        Object.assign(host.style, {
          position: "fixed",
          left: "-2000px",
          width: "600px",
          height: "480px",
          visibility: "hidden",
        });
        document.body.append(host);
        instance = monaco.editor.create(host, {
          value: "",
          language: "typescript",
          theme: "petrinaut-light",
          fontFamily: CODE_FONT_FAMILY,
          fontSize: 12,
          minimap: { enabled: false },
          dimension: { width: 600, height: 480 },
        });
        frame = requestAnimationFrame(dispose);
      });
    },
    () => {},
  );

  return () => {
    active = false;
    if (idle !== undefined) window.cancelIdleCallback(idle);
    if (frame !== undefined) cancelAnimationFrame(frame);
    dispose();
  };
};
