import { createContext, type ReactNode, use } from "react";

import type { AssistantPanel } from "@hashintel/petrinaut/ui/plugin";

/** The panel state Petrinaut AI's chat reads. */
type TestPanelState = Pick<AssistantPanel, "isOpen" | "close">;

const TestPanelContext = createContext<TestPanelState>({
  isOpen: true,
  close: () => {},
});

/**
 * Stands in for the editor's assistant panel around a chat under test. The
 * panel starts open; `state` overrides its state. The test file mocks the
 * plugin API's panel hooks with `assistantPanelMocks`.
 */
export const TestAssistantPanel = ({
  state,
  children,
}: {
  state?: Partial<TestPanelState>;
  children: ReactNode;
}) => (
  <TestPanelContext value={{ isOpen: true, close: () => {}, ...state }}>
    {children}
  </TestPanelContext>
);

/**
 * `useAssistantPanel` and `AssistantPanelTitle` for chat tests: the panel's
 * state comes from `TestAssistantPanel`, and the title bar renders in place.
 */
export const assistantPanelMocks = {
  useAssistantPanel: (): TestPanelState => use(TestPanelContext),
  AssistantPanelTitle: ({
    children,
    actions,
  }: {
    children?: ReactNode;
    actions?: ReactNode;
  }) => (
    <header>
      {children}
      {actions}
    </header>
  ),
};
