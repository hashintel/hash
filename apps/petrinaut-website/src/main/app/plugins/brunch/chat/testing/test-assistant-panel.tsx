import { createContext, type ReactNode, use } from "react";

import type { AssistantPanel } from "@hashintel/petrinaut/ui/plugin";

const TestPanelContext = createContext<AssistantPanel>({
  isOpen: true,
  close: () => {},
});

/**
 * Stands in for the editor's assistant panel around a chat renderer under
 * test: open unless `isOpen` says otherwise, with its own `close`, in an
 * `aside` that takes focus and turns inert while closed, as the editor's does.
 * Its geometry and placement are the editor shell's and are tested there;
 * tests of the real wiring render the editor.
 * The test file mocks the plugin API's panel exports with `assistantPanelMocks`.
 */
export const TestAssistantPanel = ({
  isOpen = true,
  close = () => {},
  children,
}: {
  isOpen?: boolean;
  close?: () => void;
  children: ReactNode;
}) => (
  <TestPanelContext value={{ isOpen, close }}>
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

/**
 * `useAssistantPanel` and `AssistantPanelTitle` for renderer tests: the
 * panel's state comes from `TestAssistantPanel`, and the title bar renders in
 * place with a Close button that closes the panel, as the editor's does.
 */
export const assistantPanelMocks = {
  useAssistantPanel: (): AssistantPanel => use(TestPanelContext),
  AssistantPanelTitle: ({
    children,
    actions,
  }: {
    children?: ReactNode;
    actions?: ReactNode;
  }) => {
    const panel = use(TestPanelContext);

    return (
      <header>
        {children}
        {actions}
        <button
          type="button"
          aria-label="Close AI assistant"
          onClick={() => panel.close()}
        >
          Close
        </button>
      </header>
    );
  },
};
