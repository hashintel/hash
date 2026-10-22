import { createContext, type ReactNode, use, useState } from "react";

import type { AssistantPanel } from "@hashintel/petrinaut/ui/plugin";

type TestPanelState = AssistantPanel;

const TestPanelContext = createContext<TestPanelState>({
  isOpen: true,
  close: () => {},
  collapsed: false,
  setCollapsed: () => {},
});

/**
 * Stands in for the editor's assistant panel around a chat renderer under
 * test: open unless `isOpen` says otherwise, with its own collapsed state and
 * `close`, in an `aside` that takes focus and turns inert while closed, as the
 * editor's does. Its geometry, placement, title-bar hiding and dock-height
 * reports are the editor shell's and are tested there; tests of the real
 * wiring render the editor.
 * The test file mocks the plugin API's panel exports with `assistantPanelMocks`.
 */
export const TestAssistantPanel = ({
  isOpen = true,
  initialCollapsed = false,
  close = () => {},
  children,
}: {
  isOpen?: boolean;
  initialCollapsed?: boolean;
  close?: () => void;
  children: ReactNode;
}) => {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  return (
    <TestPanelContext value={{ isOpen, close, collapsed, setCollapsed }}>
      <aside
        aria-hidden={!isOpen ? true : undefined}
        aria-label="AI assistant"
        tabIndex={-1}
        inert={!isOpen}
      >
        {children}
      </aside>
    </TestPanelContext>
  );
};

/**
 * `useAssistantPanel` and `AssistantPanelTitle` for renderer tests: the
 * panel's state comes from `TestAssistantPanel`, and the title bar renders in
 * place with a Close button that runs `onClose` before closing, as the
 * editor's does. The title bar hides while the panel is collapsed.
 */
export const assistantPanelMocks = {
  useAssistantPanel: (): AssistantPanel => use(TestPanelContext),
  AssistantPanelTitle: ({
    children,
    actions,
    onClose,
  }: {
    children?: ReactNode;
    actions?: ReactNode;
    onClose?: () => void;
  }) => {
    const panel = use(TestPanelContext);

    return (
      <header hidden={panel.collapsed}>
        {children}
        {actions}
        <button
          type="button"
          aria-label="Close AI assistant"
          onClick={() => {
            onClose?.();
            panel.close();
          }}
        >
          Close
        </button>
      </header>
    );
  },
};
