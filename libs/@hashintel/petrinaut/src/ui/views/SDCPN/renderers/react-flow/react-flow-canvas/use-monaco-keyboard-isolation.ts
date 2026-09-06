import { useEffect } from "react";

/**
 * Keeps React Flow's keyboard handling out of Monaco editors. React Flow
 * listens for Space to pan; while focus is inside an editor that keystroke
 * must reach the editor instead. Modifier shortcuts (undo, copy, paste) are
 * left alone so editor shortcuts keep working.
 */
export const useMonacoKeyboardIsolation = () => {
  useEffect(() => {
    const preventReactFlowKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isInMonaco = target.closest(".monaco-editor") !== null;
      if (!isInMonaco || event.metaKey || event.ctrlKey) {
        return;
      }
      if (event.key === " " || event.key === "Spacebar") {
        event.stopPropagation();
      }
    };

    // Capture phase, so this runs before React Flow's own listener.
    document.addEventListener("keydown", preventReactFlowKeyboard, true);
    return () => {
      document.removeEventListener("keydown", preventReactFlowKeyboard, true);
    };
  }, []);
};
