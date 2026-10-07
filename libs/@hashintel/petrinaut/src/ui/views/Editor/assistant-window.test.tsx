/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import {
  AssistantWindowContext,
  PetrinautAssistantWindow,
  PetrinautAssistantWindowPreview,
} from "./assistant-window";

import type { PluginAssistantTab } from "../../plugins/define-petrinaut-plugin";
import type { AssistantWindowHost } from "./assistant-window/window-host";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      public disconnect() {}
      public observe() {}
      public unobserve() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** A chat stand-in: a draft that must survive, and a mount counter. */
const StubChat = ({
  busy = false,
  compact = false,
  onMount = () => {},
}: {
  busy?: boolean;
  compact?: boolean;
  onMount?: () => void;
}) => {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(onMount, [onMount]);

  return (
    <PetrinautAssistantWindow
      label="Chat"
      busy={busy}
      compact={compact}
      focusTargetRef={inputRef}
      footer={
        <textarea
          ref={inputRef}
          aria-label="Draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      }
    >
      <div data-testid="transcript">Transcript</div>
    </PetrinautAssistantWindow>
  );
};

/** Hosts the window as the editor does, with a reopen control the test can press. */
const TestHost = ({
  tabs = [],
  children,
}: {
  tabs?: readonly PluginAssistantTab[];
  children: ReactNode;
}) => {
  const [isOpen, setOpen] = useState(true);
  const [placement, setPlacement] = useState<"docked" | "floating">("docked");
  const [activeTabId, setActiveTabId] = useState("chat");
  const host: AssistantWindowHost = {
    label: "Chat",
    isOpen,
    close: () => setOpen(false),
    placement,
    setPlacement,
    width: 420,
    setWidth: () => {},
    isAnimating: false,
    reportDockHeight: () => {},
    compact: false,
    setCompact: () => {},
    tabs,
    activeTabId: tabs.some((tab) => tab.id === activeTabId)
      ? activeTabId
      : "chat",
    setActiveTabId,
    focusRequest: 0,
    startRequest: null,
    consumeStartRequest: () => {},
  };

  return (
    <AssistantWindowContext value={host}>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen assistant
      </button>
      {children}
    </AssistantWindowContext>
  );
};

const ledger = (
  activityIdentities?: readonly string[],
): PluginAssistantTab => ({
  id: "ledger",
  label: "Ledger",
  activityIdentities,
  content: <p>Ledger body</p>,
});

describe("PetrinautAssistantWindow", () => {
  test("keeps the chat and its tabs mounted through docking, closing and reopening", () => {
    const mounted = vi.fn();
    render(
      <TestHost tabs={[ledger()]}>
        <StubChat onMount={mounted} />
      </TestHost>,
    );
    const panel = screen.getByRole("complementary", { name: "AI assistant" });
    fireEvent.change(screen.getByRole("textbox", { name: "Draft" }), {
      target: { value: "Keep this draft" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Ledger" }));
    const ledgerPanel = screen.getByRole("tabpanel", { name: "Ledger" });
    expect(screen.getByTestId("transcript").closest("[hidden]")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Float AI assistant" }));
    expect(panel.getAttribute("data-placement")).toBe("floating");
    fireEvent.click(screen.getByRole("button", { name: "Close AI assistant" }));
    expect(panel.hasAttribute("inert")).toBe(true);
    expect(panel.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Reopen assistant" }));

    expect(panel.hasAttribute("inert")).toBe(false);
    expect(panel.getAttribute("data-placement")).toBe("floating");
    expect(screen.getByRole("tabpanel", { name: "Ledger" })).toBe(ledgerPanel);
    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));
    expect(
      (screen.getByRole("textbox", { name: "Draft" }) as HTMLTextAreaElement)
        .value,
    ).toBe("Keep this draft");
    expect(mounted).toHaveBeenCalledOnce();
  });

  test("shows the label in the header while there are no other tabs, and falls back to the chat when a tab leaves", () => {
    const { rerender } = render(
      <TestHost tabs={[ledger()]}>
        <StubChat />
      </TestHost>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Ledger" }));

    rerender(
      <TestHost>
        <StubChat />
      </TestHost>,
    );

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("Chat")).not.toBeNull();
    expect(screen.getByTestId("transcript").closest("[hidden]")).toBeNull();
  });

  test("announces new tab activity in one live region and badges the tab until it is shown", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <TestHost tabs={[ledger(["a"])]}>
        <StubChat />
      </TestHost>,
    );
    const tabHeader = within(screen.getByRole("tablist").parentElement!);
    expect(tabHeader.getAllByRole("status")).toHaveLength(1);

    rerender(
      <TestHost tabs={[ledger(["a", "b", "c"])]}>
        <StubChat />
      </TestHost>,
    );
    expect(tabHeader.getByRole("status").textContent).toBe(
      "2 unseen Ledger updates",
    );
    expect(screen.getByRole("tab", { name: "Ledger" }).textContent).toContain(
      "2",
    );

    act(() => {
      vi.runAllTimers();
    });
    expect(tabHeader.getAllByRole("status")).toHaveLength(1);
    expect(tabHeader.getByRole("status").textContent).toBe("");
  });

  test("marks the chat tab when a turn ends while another tab is shown", () => {
    const { rerender } = render(
      <TestHost tabs={[ledger()]}>
        <StubChat busy />
      </TestHost>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Ledger" }));

    rerender(
      <TestHost tabs={[ledger()]}>
        <StubChat busy={false} />
      </TestHost>,
    );
    const status = within(screen.getByRole("tablist").parentElement!).getByRole(
      "status",
    );
    expect(status.textContent).toBe("Chat needs your attention");
    expect(
      screen
        .getByRole("tab", { name: "Chat" })
        .querySelector("[data-attention]"),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));
    expect(
      screen
        .getByRole("tab", { name: "Chat" })
        .querySelector("[data-attention]"),
    ).toBeNull();
  });

  test("focuses the chat's target when it opens, and the window itself while compact", () => {
    const { rerender } = render(
      <TestHost>
        <StubChat />
      </TestHost>,
    );
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Draft" }),
    );

    rerender(
      <TestHost>
        <StubChat compact />
      </TestHost>,
    );
    expect(document.activeElement).toBe(
      screen.getByRole("complementary", { name: "AI assistant" }),
    );
  });

  test("previews a chat outside an editor, closing on its own Close button", () => {
    render(
      <PetrinautAssistantWindowPreview placement="floating">
        <StubChat />
      </PetrinautAssistantWindowPreview>,
    );
    const panel = screen.getByRole("complementary", { name: "AI assistant" });
    expect(panel.getAttribute("data-placement")).toBe("floating");

    fireEvent.click(screen.getByRole("button", { name: "Close AI assistant" }));
    expect(panel.getAttribute("aria-hidden")).toBe("true");
  });
});
